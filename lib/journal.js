'use strict';
const _ = require('underscore');
const ObreonDate = require('./obreon-date');
const ClimateModel = require('./weather-handler');

function groupEntriesByDay(entries) {
  return _.chain(entries)
    .sortBy((a, b) => a.compare(b))
    .groupBy(entry => entry.start.toDateString())
    .values()
    .value();
}

function makeNew(constructor, constructorParams) {
  return new (constructor.bind.apply(constructor, [constructor].concat(constructorParams)));
}

class Journal {
  constructor(startLocation, startTime) {
    if (_.isArray(startLocation)) {
      this._entries = startLocation;
      if (_.isEmpty(this._entries)) {
        throw new Error('Cannot initialise Journal with empty entry array');
      }
    }
    else {
      this._entries = [];
      this._entries.push(new TravelEntry(startTime, startTime, startLocation));
    }
  }

  addEntry(entry) {
    this._entries.push(entry);
    this._entries = this._entries.sort((a, b) => a.compare(b));
  }

  travel(duration, destination) {
    this.addEntry(new TravelEntry(this.end, this.end.advance(duration), destination));
  }

  activity(duration, description) {
    this.addEntry(new ActivityEntry(this.end, this.end.advance(duration), description));
  }


  weather(at, weather) {
    this.addEntry(new WeatherEntry(at, weather));
  }

  get dateString() {
    return this.start.sameDay(this.end) ? this.start.toDateString() :
      `${this.start.toDateString()}-${this.end.toDateString()}`;
  }

  get longDateString() {
    return this.start.sameDay(this.end) ?
      `${this.start.dayName} ${ObreonDate.getOrdinal(this.start.day)} of ${this.start.monthName}` :
      `${this.start.toDateString()}-${this.end.toDateString()}`;
  }

  render(message, headingLevel) {
    headingLevel = headingLevel || 1;
    const oneDay = this.start.sameDay(this.end);
    message.heading(this.longDateString, headingLevel);

    if (oneDay) {
      message.paragraph(`The moon is ${this.start.moonPhase}.`);
      const dayWeather = this._entries.find(entry => entry instanceof WeatherEntry && entry.start.equals(entry.end));
      if (dayWeather) {
        dayWeather.render(message, headingLevel + 1);
      }
      _.without(this._entries, dayWeather).forEach(entry => entry.render(message, headingLevel + 1));
    }
    else {
      this.splitByDay().forEach(journal => journal.render(message, headingLevel + 1));
    }
  }

  static aggregate(journals) {
    return journals[0].aggregate(journals.slice(1));
  }

  aggregate(otherJournals) {
    const entries = otherJournals
      .reduce((newEntries, journal) => newEntries.concat(journal._entries), _.clone(this._entries))
      .sort((a, b) => a.compare(b))
      .map((entry, index, allEntries) => {
        if (entry._stage === 'start') {
          const end = allEntries.slice(index).find(nextEntry =>
            nextEntry._stage === 'end' && nextEntry.constructor === entry.constructor
          ).end;
          const constructorParams = entry.constructor.constructorParams(entry);
          constructorParams[1] = end;
          return makeNew(entry.constructor, constructorParams.slice(0, -1));
        }
        else if (entry._stage) {
          return undefined;
        }
        return entry;
      })
      .filter(_.negate(_.isUndefined));
    return new Journal(entries);
  }

  splitByDay() {
    const allEntries = _.flatten(this._entries.map(entry => entry.splitByDay()));
    return groupEntriesByDay(allEntries)
      .reduce((journals, entriesForDay) => {
        const previous = _.last(journals);
        const first = _.first(entriesForDay);
        if (!first instanceof TravelEntry) {
          entriesForDay.unshift(new TravelEntry(first.start.bareDate, first.start.bareDate, previous ?
            previous.finalLocation : 'unknown'));
        }
        journals.push(new Journal(entriesForDay));
        return journals;
      }, []);
  }

  get end() {
    const compareDate = ObreonDate.fromString('0000/01/01 00:00');
    return _.max(this._entries, entry => entry.end.compare(compareDate)).end;
  }

  get start() {
    const firstEntry = _.first(this._entries);
    return firstEntry && firstEntry.start;
  }

  get endLocation() {
    const travelEntryIndex = _.findLastIndex(this._entries, entry => entry instanceof TravelEntry);
    if (travelEntryIndex !== -1) {
      return this._entries[travelEntryIndex]._destination;
    }
    return 'Unknown';
  }

  get latestWeather() {
    const weatherEntryIndex = _.findLastIndex(this._entries, entry => entry instanceof WeatherEntry);
    if (weatherEntryIndex !== -1) {
      return this._entries[weatherEntryIndex]._weather;
    }
    return null;
  }

  static reviver(key, value) {
    switch (key) {
      case '_entries':
        return value.map(entry => this.makeEntry(entry.type, entry));
      case '_start':
      case '_end':
        return new ObreonDate(value);
      case '_weather':
        return ClimateModel.getClimateModel(value.climateModel).getWeatherState(value);
      case '':
        return new Journal(value._entries);
      default:
        return value;
    }
  }

  static parseFromJSON(jsonString) {
    return JSON.parse(jsonString, this.reviver.bind(this));
  }

  static makeEntry(type, properties) {
    const constructor = this.entryTypes[type];
    if (!constructor) {
      throw new Error(`unrecognised entry type ${type}`);
    }
    return makeNew(constructor, constructor.constructorParams(properties));
  }

  static get entryTypes() {
    return [TravelEntry, WeatherEntry, ActivityEntry].reduce((lookup, constructor) => {
      lookup[constructor.name] = constructor;
      return lookup;
    }, {});
  }

  get logWrap() {
    return 'Journal';
  }
}

class JournalEntry {
  constructor(start, end, stage) {
    this._start = start;
    this._end = end;
    this._stage = stage;
  }

  getTimeSpecFor(includeDate) {
    const func = includeDate ? 'toDateString' : 'toTimeString';
    return this._end ? `${this._start[func]()}-${this._end[func]()}` : this._start[func]();
  }

  splitByDay() {
    if (this.start.sameDay(this.end)) {
      return [this];
    }

    const entries = [
      this.makeMultiDayEntry(this.start, this.start.endOfDay, 'start'),
      this.makeMultiDayEntry(this.end.startOfDay, this.end, 'end'),
    ];

    let nextDay = _.first(entries).end.nextDay;
    while (!_.last(entries).start.sameDay(nextDay)) {
      entries.splice(-1, 0, this.makeMultiDayEntry(nextDay.startOfDay, nextDay.endOfDay, 'middle'));
      nextDay = nextDay.nextDay;
    }

    return entries;
  }

  compare(that) {
    return this.start.compare(that.start) || this.end.compare(that.end);
  }

  render(/* message, headingLevel */) {
    throw new Error('Subclasses must implement render');
  }

  makeMultiDayEntry(start, end, stage) {
    const constructorParams = this.constructor.constructorParams(this);
    constructorParams[0] = start;
    constructorParams[1] = end;
    constructorParams[constructorParams.length - 1] = stage;
    return makeNew(this.constructor, constructorParams);
  }


  get start() {
    return this._start;
  }

  get end() {
    return this._end || this._start;
  }


  toJSON() {
    return _.defaults({ type: this.constructor.name }, this);
  }

}


class WeatherEntry extends JournalEntry {
  constructor(time, weather, stage) {
    super(time, undefined, stage);
    this._weather = weather;
  }

  render(message) {
    message.paragraph(this._weather.getWeatherText());
  }

  static constructorParams(object) {
    return [object._start, object._weather, object._stage];
  }

  static get logWrap() {
    return 'WeatherEntry';
  }
}

class ActivityEntry extends JournalEntry {
  constructor(start, end, text, stage) {
    super(start, end, stage);
    this._text = text;
  }

  render(message) {
    let text = `<em style="font-size:larger">${this.getTimeSpecFor(false)}: </em>`;
    switch (this._stage) {
      case 'start':
        text += `${this._text} (start)`;
        break;
      case 'middle':
        text += `${this._text} (continued)`;
        break;
      case 'end':
        text += `${this._text} (end)`;
        break;
      default:
        text += this._text;
    }
    message.paragraph(text);
  }

  static constructorParams(object) {
    return [object._start, object._end, object._text, object._stage];
  }

  static get logWrap() {
    return 'ActivityEntry';
  }
}

class TravelEntry extends JournalEntry {
  constructor(start, end, destination, stage) {
    super(start, end, stage);
    this._destination = destination;
  }

  render(message) {
    if (this.start.equals(this.end)) {
      message.paragraph(`You are at ${this._destination}`);
    }
    else {
      let text = `<em>${this.getTimeSpecFor(false)}: </em>`;
      switch (this._stage) {
        case 'start':
          text += `Start of journey to ${this._destination}`;
          break;
        case 'middle':
          text += `Journey to ${this._destination}`;
          break;
        case 'end':
          text += `End of journey to ${this._destination}`;
          break;
        default:
          text += this._destination;
      }
      message.paragraph(text);
    }
  }

  static constructorParams(object) {
    return [object._start, object._end, object._destination, object._stage];
  }

  static get logWrap() {
    return 'TravelEntry';
  }
}

module.exports = Journal;
