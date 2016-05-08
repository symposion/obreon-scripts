/* globals unescape */
'use strict';
const cp = require('./command-processor');
const ObreonDate = require('./obreon-date');
const DiceRoller = require('./dice-roller');
const ClimateModel = require('./weather-handler');
// const climate = require('./osherion-climate');
const _ = require('underscore');

// function dateValidator(value) {
//   try {
//     return {
//       converted: ObreonDate.fromString(value, { month: 1, day: 1, hour: 8, minute: 0 }),
//       valid: true,
//     };
//   }
//   catch (e) {
//     return {
//       converted: null,
//       valid: false,
//     };
//   }
// }

function stringValidator(value) {
  return {
    valid: true,
    converted: value,
  };
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

// function integerValidator(value) {
//   const parsed = parseInt(value, 10);
//   return {
//     converted: parsed,
//     valid: !isNaN(parsed),
//   };
// }

// function booleanValidator(value) {
//   const converted = value === 'true' || (value === 'false' ? false : value);
//   return {
//     valid: typeof value === 'boolean' || value === 'true' || value === 'false',
//     converted,
//   };
// }

module.exports = class ObreonScripts {
  constructor(roll20, logger) {
    this.roll20 = roll20;
    this.logger = logger;
    this.cp = cp('obreon', this.roll20);
    this.myState = this.roll20.getState('ObreonScripts');
    this.diceRoller = new DiceRoller(this.roll20);
    this.climateModel = new ClimateModel(this.diceRoller);
    logger.wrapModule(this.climateModel);
    logger.wrapModule(this.cp);
  }

  wrapJournal(journalEntry) {
    const journalEntryTitle = journalEntry.get('name');
    const match = journalEntryTitle.match(/Journal:([^-]+)(?:-(.*))?/);
    const end = match[2] && ObreonDate.fromString(match[2]);
    const re = /^(?:([\d\/: ]+)-([\d\/: ]+):(.*)|Location: (.*))/;
    const module = this;

    function getNotesPromise() {
      return new Promise((resolve) => journalEntry.get('notes', resolve));
    }


    const wrapper = {
      get(propName, cb) {
        return journalEntry.get(propName, cb);
      },
      set(propName, propVal) {
        return journalEntry.set(propName, propVal);
      },
      getEntries() {
        return getNotesPromise()
          .then(notes =>
            unescape(notes).split('<br>')
              .map(line => {
                const lineMatch = line.match(re);
                if (lineMatch) {
                  return {
                    start: lineMatch[1] && ObreonDate.fromString(`${lineMatch[1]}`, this.start),
                    end: lineMatch[2] && ObreonDate.fromString(`${lineMatch[2]}`, this.start),
                    text: lineMatch[3],
                    location: lineMatch[4],
                  };
                }
                return undefined;
              })
              .filter(_.negate(_.isUndefined))
          );
      },

      appendToNotes(text) {
        return getNotesPromise()
          .then(notes => {
            if (notes) {
              journalEntry.set('notes', `${notes}<br>${text}`);
            }
            else {
              journalEntry.set('notes', text);
            }
            return this;
          });
      },

      addEntry(entryStart, entryEnd, text) {
        const timeSpec = entryStart.sameDay(entryEnd) ? `${entryStart.toTimeString()}-${entryEnd.toTimeString()}` :
          `${entryStart.toString()}-${entryEnd.toString()}`;
        return this.appendToNotes(`${timeSpec}: ${text}`);
      },

      changeLocation(location) {
        return this.appendToNotes(`Location: ${location}`);
      },


      getWeatherPromise() {
        return new Promise(resolve => journalEntry.get('gmnotes', resolve))
          .then(gmnotes => {
            const weatherMatch = unescape(gmnotes).match(/WEATHER:(.*)/);
            if (weatherMatch) {
              const weatherData = _.last(JSON.parse(weatherMatch[1]).days);
              weatherData.date = weatherData.date || this.end;
              return module.logger.wrapModule(ClimateModel.getWeatherState(weatherData, module.diceRoller));
            }
            const newWeather = module.climateModel.getWeatherForDay(journalEntry.end);
            journalEntry.set('gmnotes', `${gmnotes}\nWEATHER:${{ days: [newWeather] }}`);
            return ClimateModel.getWeatherState(newWeather, module.diceRoller);
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


      getSummaryTextPromise() {
        return this.getFinalStatusPromise()
          .then(statusInfo =>
            `It's ${statusInfo.lastTime.toLongString()}. The moon is ${statusInfo.lastTime.moonPhase}. ` +
            `You are${statusInfo.lastLocation.startsWith('on the way') ? '' : ' at'} ${statusInfo.lastLocation}. ` +
            `${statusInfo.weather.getWeatherText()}`
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

  getJournalEntries() {
    return this.roll20.findObjs({ type: 'handout' })
      .filter(handout => handout.get('name').match(/Journal:([^-]+)(?:-(.*))?/))
      .map(handout => this.wrapJournal(handout))
      .sort((a, b) => a.start.compare(b.start));
  }

  getLastJournalEntry() {
    return _.last(this.getJournalEntries());
  }

  getLastDate() {
    const entry = this.getLastJournalEntry();
    return entry && entry.end;
  }


  getMotdTextPromise() {
    return this.getLastJournalEntry().getSummaryTextPromise()
      .then(text => `Welcome %%NAME%%!\n${text}`);
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

        let currentDayPromise = currentJournal.addEntry(start, endForFirstDay, startDayJournalText);
        if (!shouldAddEntryToNewJournal) {
          currentDayPromise = currentDayPromise.then(addLocation);
        }

        if (end.sameDay(start)) {
          return currentDayPromise;
        }

        const makeNewJournalPromise = this.getNewJournalPromise(end, currentJournal, options.location)
          .then(nextJournal => {
            if (shouldAddEntryToNewJournal) {
              return nextJournal.addEntry(start.nextDay.startOfDay, end, `${options.text} (end)`)
                .then(addLocation);
            }
            return addLocation(nextJournal);
          });

        return Promise.all([currentDayPromise, makeNewJournalPromise]);
      })
      .then(results => {
        if (_.isArray(results)) {
          this.roll20.sendChat('',
            `${results[0]} completed and new entry started for ${results[1].start.toDateString()}`);
          return results[1].getSummaryTextPromise();
        }

        this.roll20.sendChat('', `${results} updated with new entry`);
        return results.getSummaryTextPromise();
      })
      .then(summaryText => {
        this.roll20.sendChat('', summaryText);
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

    return Promise.all([statusPromise, weatherPromise])
      .then(results => {
        const journal = this.wrapJournal(this.roll20.createObj('handout', {
          name: `Journal:${dateString}`,
          inplayerjournals: 'all',
        }));

        let notes;
        if (!multiDay) {
          notes = `The moon is ${end.moonPhase}. ${results[0].weather.getWeatherText()}`;
        }
        if (!destination) {
          notes += `<br>Location: ${results[0].lastLocation}`;
        }

        if (multiDay) {
          const weatherString = results[1].map(weather => `${weather.date.toDateString()}: ${weather.getWeatherText()}`)
            .join('<br>');
          notes = `Multi day entry. Weather:<br>${weatherString}`;
        }

        if (destination) {
          notes += `<br>Location: on the way to ${destination}`;
        }

        journal.set('notes', notes);
        journal.set('gmnotes', `WEATHER:${JSON.stringify({ days: results[1] })}`);
        return journal;
      });
  }


  getJournal(date) {
    return this.getJournalEntries().find(entry => entry.start.sameDay(date));
  }

  displayMotd(player, prev) {
    if (player.get('online') === true && prev._online === false) {
      return this.getMotdTextPromise().then(motdText => {
        setTimeout(() => {
          const who = player.get('displayname').split(/\s/)[0];
          this.roll20.sendChat('MotD', `/w ${who} ${motdText.replace(/%%NAME%%/g, player.get('displayname'))}`);
        }, 5000);
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
      .optionLookup('duration', durationLookup, true);
  }

  get logWrap() {
    return 'ObreonScripts';
  }

  toJSON() {
    return { name: 'ObreonScripts' };
  }
};
