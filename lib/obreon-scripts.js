/* globals unescape */
'use strict';
const cp = require('./command-processor');
const ObreonDate = require('./obreon-date');
const ClimateModel = require('./weather-handler');
const Journal = require('./journal');
const _ = require('underscore');
const Reporter = require('./reporter');
const JournalWrapper = require('./journal-wrapper');

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

function integerValidator(value) {
  const parsed = parseInt(value, 10);
  return {
    converted: parsed,
    valid: !isNaN(parsed),
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


module.exports = class ObreonScripts {
  constructor(roll20, logger, makeMoon) {
    this.roll20 = roll20;
    this.logger = logger;
    this.cp = cp('obreon', this.roll20);
    this.reporter = new Reporter(roll20, logger);
    this.myState = this.roll20.getState('ObreonScripts');
    this.climateModel = ClimateModel.getClimateModel('OsherionClimate');
    this.makeMoon = makeMoon;
    logger.wrapModule(this.cp);
  }


  getMotdMessagePromise(playerName) {
    return this.getLatestJournalWrapperPromise()
      .then(journalWrapper => {
        const journal = journalWrapper.journal;
        return this.reporter.makeScrollMessage()
          .append(`Welcome ${playerName}!<br>`)
          .append(`It's ${journal.end.toLongString()}. `)
          .append(`You are at ${journal.endLocation}.`)
          .append(`${journal.latestWeather.getWeatherText()}.`)
          .addFloatingImage(journal.latestWeather.getWeatherGraphic(), 40, 40)
          .addFloatingSection(this.makeMoon(journal.end), 25, 25);
      });
  }

  addToJournal(options, journalUpdateCallback) {
    const duration = options.duration.reduce((obj, item) => _.extend(obj, item));

    this.getLatestJournalWrapperPromise()
      .then(latestJournalWrapper => {
        if (!latestJournalWrapper) {
          throw new Error('Can\'t record activity without previous journal entry to base duration on');
        }

        const journal = latestJournalWrapper.journal;
        let current = journal.end;
        let weather = journal.latestWeather;
        journalUpdateCallback(journal, duration);

        while (!current.sameDay(journal.end)) {
          current = current.nextDay.startOfDay;
          weather = this.climateModel.getNextDayWeather(weather, current);
          journal.weather(current, weather);
        }
        latestJournalWrapper.save();
      })
      .catch(e => {
        this.logger.error(e.toString());
        this.logger.error(e.stack);
        this.roll20.sendChat('ObreonScripts', 'An error occurred, please see log');
      });
  }

  recordActivity(options) {
    this.addToJournal(options, (journal, duration) => {
      journal.activity(duration, options.text, options.xp);
      if (options.xp) {
        const partyMemberIds = journal.getPartyMemberIds();
        const individualXP = Math.ceil(options.xp / partyMemberIds.length);

        const updated = _.compact(partyMemberIds.map(characterId => {
          const isNPC = this.roll20.getAttrByName(characterId, 'is_npc');
          if (!isNPC || isNPC === '0') {
            const nextLevelXP = this.roll20.getAttrByName(characterId, 'xp_next_level');
            const newXP = this.roll20.processAttrValue(characterId, 'xp', currentXP =>
            parseInt(currentXP || 0, 10) + individualXP);
            const name = this.roll20.getObj('character', characterId).get('name');
            let message = `${name} now has ${newXP} XP`;
            if (newXP >= nextLevelXP) {
              message += ' and has gone up a level.';
            }
            return message;
          }
          return null;
        }));

        const message = this.reporter.makeScrollMessage();
        message.append('Journal entry recorded successfully.');
        if (updated.length) {
          updated.forEach(line => message.append(line));
        }
        message.append(`The time now is ${journal.end.toString()}`);
        message.send();
      }
    });
  }

  travel(options) {
    this.addToJournal(options, (journal, duration) => {
      journal.travel(duration, options.destination);
      const message = this.reporter.makeScrollMessage();
      message.append(`You are now at ${journal.endLocation}. The time is ${journal.end.toDateString()}.`);
      message.send();
    });
  }

  addPartyMembers(options) {
    options.duration = [{}];
    this.addToJournal(options, journal => {
      journal.addPartyMembers(_.pluck(options.selected.character, 'id'));
      this.reportPartyMembers(journal);
    });
  }

  removePartyMembers(options) {
    options.duration = [{}];
    this.addToJournal(options, journal => {
      journal.removePartyMembers(_.pluck(options.selected.character, 'id'));
      this.reportPartyMembers(journal);
    });
  }

  reportPartyMembers(journal) {
    const message = this.reporter.makeScrollMessage();
    const partyMemberString = journal.getPartyMemberIds()
      .map(characterId => this.roll20.getObj('character', characterId).get('name'))
      .join(', ');
    message.append(`The party is now: ${partyMemberString}`);
    message.send();
  }

  // deleteJournal(options) {
  // if (options.date) {
  //   options.start = options.end = options.date;
  // }
  //
  // const removed = this.getJournalHandouts()
  //   .filter(journal =>
  //     journal.start.compare(options.start) >= 0 && journal.end.compare(options.end) <= 0
  //   )
  //   .map(journal => {
  //     this.logger.debug('Removing journal $$$', journal);
  //     return journal.remove();
  //   });
  //
  // const message = _.isEmpty(removed) ? 'Nothing to remove' :
  //   `Removed: <ul><li>${removed.join('</li><li>')}</li></ul>`;
  // this.roll20.sendChat('', message);
  // }


  displayMotd(player, prev) {
    if (player.get('online') === true && prev._online === false) {
      const playerName = player.get('displayname');
      return this.getMotdMessagePromise(playerName)
        .then(message => {
          setTimeout(() => {
            message.send(playerName);
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


  getLatestJournalWrapperPromise() {
    return Promise.all(this.roll20.findObjs({ type: 'handout' })
      .filter(handout => handout.get('name').match(/Journal:([^-]+)(?:-(.*))?/))
      .map(handout => JournalWrapper.getWrapperPromise(this.roll20, this.reporter, handout, this.logger))
    )
      .then(journalWrappers => journalWrappers.sort((a, b) => a.journal.start.compare(b.journal.start)).pop());
  }

  startJournal(options) {
    let journalWrapperPromise;
    if (options.location && options.date) {
      const journal = new Journal(options.location, options.date);
      journal.weather(options.date, this.climateModel.getWeatherForDay(options.date));
      journalWrapperPromise = Promise.resolve(new JournalWrapper(journal, this.roll20, this.reporter));
    }
    else {
      journalWrapperPromise = this.getLatestJournalWrapperPromise().then(prevJW => {
        const prevJournal = prevJW.journal;

        const journal = new Journal(prevJournal.endLocation, prevJournal.end);
        journal.weather(prevJournal.end, prevJournal.latestWeather);
        return new JournalWrapper(journal, this.roll20, this.reporter);
      });
    }

    journalWrapperPromise.then(jw => jw.save());
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
    finally {
      this.logger.prefixString = '';
    }
  }

  registerEventHandlers() {
    this.roll20.on('chat:message', this.handleInput.bind(this));
    this.roll20.on('change:player:_online', this.displayMotd.bind(this));
    this.cp
      .addCommand('start-journal', this.startJournal.bind(this))
      .option('date', dateValidator)
      .option('location', stringValidator)
      .addCommand('record-activity', this.recordActivity.bind(this))
      .option('text', stringValidator, true)
      .option('xp', integerValidator, false)
      .optionLookup('duration', durationLookup, true)
      .addCommand('travel', this.travel.bind(this))
      .option('destination', stringValidator, true)
      .optionLookup('duration', durationLookup, true)
      .addCommand('addToParty', this.addPartyMembers.bind(this))
      .withSelection({
        character: {
          min: 1,
          max: Infinity,
        },
      })
      .addCommand('removeFromParty', this.removePartyMembers.bind(this))
      .withSelection({
        character: {
          min: 1,
          max: Infinity,
        },
      });
    // .addCommand('delete-journal', this.deleteJournal.bind(this))
    // .option('start', dateValidator)
    // .option('date', dateValidator)
    // .option('end', dateValidator);
  }

  get logWrap() {
    return 'ObreonScripts';
  }

  toJSON() {
    return { name: 'ObreonScripts' };
  }
};
