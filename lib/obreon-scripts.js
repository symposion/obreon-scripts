/* globals unescape */
'use strict';
const cp = require('./command-processor');
const ObreonDate = require('./obreon-date');
const DiceRoller = require('./dice-roller');
const ClimateModel = require('./weather-handler');
const _ = require('underscore');
const Reporter = require('./reporter');
const utils = require('./utils');

function stringValidator(value) {
  return {
    valid: true,
    converted: value,
  };
}

function dateValidator(value) {
  try {
    return {
      converted: ObreonDate.fromString(value, { month: 1, day: 1, hour: 8, minute: 0 }),
      valid: true,
    };
  }
  catch (e) {
    return {
      converted: null,
      valid: false,
    };
  }
}

function durationLookup(arg) {
  const parts = arg.split(/\s/);
  if (_.contains(ObreonDate.fields, parts[0].toLowerCase())) {
    const obj = {};
    obj[parts[0]] = parseInt(parts[1], 10);
    return obj;
  }
  return null;
}

class JournalEntry {
  constructor(type, parent) {
    utils.checkParam(type, 'type');
    utils.checkParam(parent, 'parent');

    this.type = type;
    this.parent = parent;
  }

  get fromMultiDay() {
    return !this.parent.start.sameDay(this.parent.end);
  }

  getTimeString(date) {
    return this.fromMultiDay ? date.toString() : date.toTimeString();
  }

  getDetailString() {
    throw new Error('Subclasses must implement getDetailString');
  }

  toString() {
    return `${this.type}: ${this.getDetailString()}`;
  }
}

class EventEntry extends JournalEntry {
  constructor(start, end, text, parent) {
    super('Event', parent);
    this.text = text;
    this.start = start;
    this.end = end;
  }

  getDetailString() {
    const timeSpec = `${this.getTimeString(this.start)}-${this.getTimeString(this.end)}`;
    return `${timeSpec}: ${this.text}`;
  }

  static parseFrom(string, parent) {
    const match = string.match(/Event: ([\d\/: ]+)-([\d\/: ]+):\s*(.*)/);
    if (match) {
      return new EventEntry(
        ObreonDate.fromString(match[1], parent.start),
        ObreonDate.fromString(match[2], parent.end),
        match[3],
        parent);
    }
    return undefined;
  }
}

class LocationEntry extends JournalEntry {
  constructor(location, parent) {
    super('Location', parent);
    this.location = location;
  }

  getDetailString() {
    return this.location;
  }

  static parseFrom(string, parent) {
    const match = string.match(/Location:\s*(.*)/);
    if (match) {
      return new LocationEntry(match[1], parent);
    }
    return undefined;
  }
}

class DayStartEntry extends JournalEntry {
  constructor(weatherText, date, parent) {
    super('Day Start', parent);
    this.date = date;
    this.weatherText = weatherText;
  }

  getDetailString() {
    if (this.fromMultiDay) {
      return `${this.date.toDateString()}: ${this.weatherText}`;
    }
    return this.weatherText;
  }

  static parseFrom(string, parent) {
    const match = string.match(/Day Start:\s*(?:([\d\/]+):\s*)?(.*)/);
    if (match) {
      return new DayStartEntry(match[2], match[1] && ObreonDate.fromString(match[1], parent.start), parent);
    }
    return undefined;
  }
}

const entryParsers = [DayStartEntry.parseFrom, EventEntry.parseFrom, LocationEntry.parseFrom];

module.exports = class ObreonScripts {
  constructor(roll20, logger, makeMoon) {
    this.roll20 = roll20;
    this.logger = logger;
    this.cp = cp('obreon', this.roll20);
    this.reporter = new Reporter(roll20, logger);
    this.myState = this.roll20.getState('ObreonScripts');
    this.diceRoller = new DiceRoller(this.roll20);
    this.climateModel = new ClimateModel(this.diceRoller);
    this.makeMoon = makeMoon;
    logger.wrapModule(this.climateModel);
    logger.wrapModule(this.cp);
  }

  wrapJournal(journalEntry) {
    const journalEntryTitle = journalEntry.get('name');
    const match = journalEntryTitle.match(/Journal:([^-]+)(?:-(.*))?/);
    const end = match[2] && ObreonDate.fromString(match[2]);
    const module = this;

    function getNotesPromise() {
      return new Promise((resolve) => journalEntry.get('notes', resolve));
    }


    const wrapper = {
      getEntries() {
        return getNotesPromise()
          .then(notes => {
            if (!notes) {
              return [];
            }
            const entryText = unescape(notes)
              .replace(/[\s\S]*<div class=".*scrollyBg"[^>]+>([\s\S]*)(?:<\/div>\s*){3}/, '$1');

            return entryText
              .trim()
              .split('<br>')
              .map(line => entryParsers.reduce((result, parser) => result || parser(line, this), null))
              .filter(_.negate(_.isUndefined));
          });
      },

      addEntry(entry) {
        return this.getEntries()
          .then(entries => {
            entries.push(entry);
            const notesText = module.reporter.frameHandout(entries);
            journalEntry.set('notes', notesText);
            return this;
          });
      },

      addEventEntry(entryStart, entryEnd, text) {
        return this.addEntry(new EventEntry(entryStart, entryEnd, text, this));
      },

      changeLocation(location) {
        return this.addEntry(new LocationEntry(location, this));
      },

      startDay(weather) {
        const dataUpdatePromise = this.getInternalDataPromise()
          .then(data => {
            data.weather = data.weather || [];
            data.weather.push(weather);
            return this.saveData(data);
          });

        const entryAddPromise = this.addEntry(new DayStartEntry(weather.getWeatherText(), weather.date, this));

        return Promise.all([dataUpdatePromise, entryAddPromise])
          .then(results => results[1]);
      },

      remove() {
        const title = journalEntry.get('name');
        journalEntry.remove();
        return title;
      },

      getInternalDataPromise() {
        return new Promise(resolve => journalEntry.get('gmnotes', resolve))
          .then(gmnotes => {
            const dataMatch = unescape(gmnotes).match(/DATA:(.*)/);
            if (dataMatch) {
              return JSON.parse(dataMatch[1]);
            }

            gmnotes = gmnotes ? `${gmnotes}<br>` : '';
            gmnotes += 'DATA: {}';
            journalEntry.set('gmnotes', gmnotes);
            return {};
          });
      },

      saveData(data) {
        return new Promise(resolve => journalEntry.get('gmnotes', resolve))
          .then(gmnotes => {
            journalEntry.set('gmnotes', gmnotes.replace(/DATA:.*/, `DATA:${JSON.stringify(data)}`));
            return this;
          });
      },

      getWeatherPromise() {
        return this.getInternalDataPromise()
          .then(data => {
            if (data.weather) {
              const weatherData = _.last(data.weather);
              weatherData.date = weatherData.date || this.end;
              return module.logger.wrapModule(ClimateModel.getWeatherState(weatherData, module.diceRoller));
            }
            const newWeather = module.climateModel.getWeatherForDay(this.end);
            data.weather = [newWeather];
            return this.saveData(data).then(() => newWeather);
          });
      },

      getFinalStatusPromise() {
        return Promise.all([this.getWeatherPromise(), this.getEntries()])
          .then(results => {
            const reversedEntries = Array.apply(null, results[1]).reverse();
            const lastTimedEntry = reversedEntries.find(_.property('start'));
            const lastLocationEntry = reversedEntries.find(_.property('location'));
            return {
              lastTime: lastTimedEntry ? lastTimedEntry.end : this.end.startOfDay,
              lastLocation: lastLocationEntry ? lastLocationEntry.location : 'unknown',
              weather: results[0],
            };
          });
      },


      getSummaryMessagePromise(message) {
        return this.getFinalStatusPromise()
          .then(statusInfo =>
            (message || module.reporter.makeScrollMessage())
              .append(`It's ${statusInfo.lastTime.toLongString()}. ` +
                `You are${statusInfo.lastLocation.startsWith('on the way') ? '' : ' at'} ${statusInfo.lastLocation}. ` +
                `${statusInfo.weather.getWeatherText()}`)
              .addFloatingImage(statusInfo.weather.getWeatherGraphic(), 40, 40)
              .addFloatingSection(module.makeMoon(statusInfo.lastTime), 25, 25)
          );
      },

      toString() {
        let string = `Journal for ${this.start.toDateString()}`;
        if (!this.end.sameDay(this.start)) {
          string += `-${this.end.toDateString()}`;
        }
        return string;
      },

      toJSON() {
        return { journal: `Journal entry for: ${this.start.toDateString()}` };
      },

      get logWrap() {
        return 'JournalWrapper';
      },
    };
    Object.defineProperty(wrapper, 'start', {
      value: ObreonDate.fromString(match[1]),
    });
    Object.defineProperty(wrapper, 'end', {
      get: function getEnd() {
        return end || this.start;
      },
    });

    return wrapper;
  }

  getJournalHandouts() {
    const entries = this.roll20.findObjs({ type: 'handout' })
      .filter(handout => handout.get('name').match(/Journal:([^-]+)(?:-(.*))?/))
      .map(handout => this.wrapJournal(handout))
      .sort((a, b) => a.start.compare(b.start));
    if (_.isEmpty(entries)) {
      const message = this.reporter.makeScrollMessage().append('No journal entries yet');
      entries.push({
        getSummaryMessagePromise() {
          return Promise.resolve(message);
        },
      });
    }
    return entries;
  }

  getLastJournalEntry() {
    return _.last(this.getJournalHandouts());
  }

  getLastDate() {
    const entry = this.getLastJournalEntry();
    return entry && entry.end;
  }


  getMotdMessagePromise(playerName) {
    return this.getLastJournalEntry().getSummaryMessagePromise()
      .then(message => message.prepend(`Welcome ${playerName}!<br>`));
  }

  recordActivity(options) {
    const currentJournal = this.getLastJournalEntry();
    if (!currentJournal) {
      throw new Error('Can\'t record activity without previous journal entry to base duration on');
    }

    const duration = options.duration.reduce((obj, item) => _.extend(obj, item));

    function addLocation(journalEntry) {
      return options.location ? journalEntry.changeLocation(options.location) : journalEntry;
    }

    return currentJournal.getFinalStatusPromise()
      .then(status => {
        const start = status.lastTime;
        const end = start.advance(duration);

        const midnightCase = end.isNextDay(start) && end.startOfDay.equals(end);
        const shouldAddEntryToNewJournal = !midnightCase && !end.sameDay(start);

        const startDayJournalText = shouldAddEntryToNewJournal ? `${options.text} (start)` : options.text;
        const endForFirstDay = end.sameDay(start) ? end : start.endOfDay;

        let currentDayPromise = currentJournal.addEventEntry(start, endForFirstDay, startDayJournalText);
        if (!shouldAddEntryToNewJournal) {
          currentDayPromise = currentDayPromise.then(addLocation);
        }

        if (end.sameDay(start)) {
          return currentDayPromise;
        }

        const makeNewJournalPromise = currentDayPromise
          .then(updatedCurrentJournal => this.getNewJournalPromise(end, updatedCurrentJournal, options.location))
          .then(nextJournal => {
            if (shouldAddEntryToNewJournal) {
              return nextJournal.addEventEntry(start.nextDay.startOfDay, end, `${options.text} (end)`)
                .then(addLocation);
            }
            return addLocation(nextJournal);
          });

        return Promise.all([currentDayPromise, makeNewJournalPromise]);
      })
      .then(results => {
        const message = this.reporter.makeScrollMessage();
        if (_.isArray(results)) {
          message.append(`${results[0]} completed and new entry started for ${results[1].start.toDateString()}`);
          return results[1].getSummaryMessagePromise(message);
        }

        message.append(`${results} updated with new entry`);
        return results.getSummaryMessagePromise(message);
      })
      .then(message => {
        message.send();
      })
      .catch(e => {
        this.logger.error(e.toString());
        this.logger.error(e.stack);
        this.roll20.sendChat('ObreonScripts', 'An error occurred, please see log');
      });
  }

  travel(options) {
    options.location = options.destination;
    options.text = `Travel to ${options.location}`;
    return this.recordActivity(options);
  }

  getNewJournalPromise(end, previousJournal, destination) {
    const statusPromise = previousJournal.getFinalStatusPromise();
    const start = previousJournal.end.nextDay.startOfDay;
    const multiDay = !start.sameDay(end);
    const dateString = multiDay ? `${start.toDateString()}-${end.toDateString()}` : start.toDateString();

    const weatherPromise = statusPromise
      .then(status => {
        const prevWeather = status.weather;
        const daysBetween = end.startOfDay.compare(start, 'day');
        const promises = _.range(0, daysBetween)
          .reduce(weatherPromises => {
            const nextPromise = _.last(weatherPromises);
            weatherPromises.push(nextPromise.then(newWeather => newWeather.getNextDayWeatherPromise()));
            return weatherPromises;
          }, [prevWeather.getNextDayWeatherPromise()]);

        return Promise.all(promises);
      });

    const journalPromise = statusPromise
      .then(status => {
        const journal = this.wrapJournal(this.roll20.createObj('handout', {
          name: `Journal:${dateString}`,
          inplayerjournals: 'all',
        }));

        if (!destination) {
          return journal.changeLocation(status.lastLocation);
        }

        return journal.changeLocation(`on the way to ${destination}`);
      });

    return Promise.all([journalPromise, weatherPromise])
      .then(results => results[1].reduce((updatedJournalPromise, weather) =>
        updatedJournalPromise.then(journal => journal.startDay(weather)), Promise.resolve(results[0]))
      );
  }


  getJournal(date) {
    return this.getJournalHandouts().find(entry => entry.start.sameDay(date));
  }

  deleteJournal(options) {
    if (options.date) {
      options.start = options.end = options.date;
    }

    const removed = this.getJournalHandouts()
      .filter(journal =>
        journal.start.compare(options.start) >= 0 && journal.end.compare(options.end) <= 0
      )
      .map(journal => {
        this.logger.debug('Removing journal $$$', journal);
        return journal.remove();
      });

    const message = _.isEmpty(removed) ? 'Nothing to remove' :
      `Removed: <ul><li>${removed.join('</li><li>')}</li></ul>`;
    this.roll20.sendChat('', message);
  }


  displayMotd(player, prev) {
    if (player.get('online') === true && prev._online === false) {
      const playerName = player.get('displayname');
      return this.getMotdMessagePromise(playerName)
        .then(message => {
          setTimeout(() => {
            message.send();
          }, 5000);
        })
        .catch(e => {
          this.roll20.sendChat('ObreonScripts', 'An error occurred, please see log');
          this.logger.error(e.toString());
          this.logger.error(e.stack);
        });
    }
    return Promise.resolve();
  }

  handleInput(msg) {
    try {
      this.cp.processCommand(msg);
    }
    catch (e) {
      this.roll20.sendChat('ObreonScripts', 'An error occurred, please see log');
      this.logger.error(e.toString());
      this.logger.error(e.stack);
    }
  }

  registerEventHandlers() {
    this.roll20.on('chat:message', this.handleInput.bind(this));
    this.roll20.on('change:player:_online', this.displayMotd.bind(this));
    this.cp
      .addCommand('record-activity', this.recordActivity.bind(this))
      .option('text', stringValidator, true)
      .optionLookup('duration', durationLookup, true)
      .addCommand('travel', this.travel.bind(this))
      .option('destination', stringValidator, true)
      .optionLookup('duration', durationLookup, true)
      .addCommand('delete-journal', this.deleteJournal.bind(this))
      .option('start', dateValidator)
      .option('date', dateValidator)
      .option('end', dateValidator);
  }

  get logWrap() {
    return 'ObreonScripts';
  }

  toJSON() {
    return { name: 'ObreonScripts' };
  }
};
