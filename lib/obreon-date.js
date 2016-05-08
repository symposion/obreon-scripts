'use strict';
const _ = require('underscore');


const maxima = {
  year: Infinity,
  month: 10,
  day: 30,
  hour: 23,
  minute: 59,
};

const minima = {
  year: 1,
  month: 1,
  day: 1,
  hour: 0,
  minute: 0,
};

const counts = _.mapObject(maxima, (maximum, field) => maximum + 1 - minima[field]);

const fields = ['year', 'month', 'day', 'hour', 'minute'];

function zeroPad(number) {
  return number < 10 ? `0${number}` : `${number}`;
}

const multipliers = fields.reduce((lookup, field, index) => {
  fields.slice(index + 1).forEach(conversionField => {
    lookup[field][conversionField] *= counts[conversionField];
    fields.slice(0, index).forEach(convertorField => {
      lookup[convertorField][conversionField] *= counts[field];
    });
  });
  fields.slice(0, index).forEach((conversionField, innerIndex) => {
    lookup[field][conversionField] /= counts[fields[innerIndex + 1]];
    fields.slice(index + 1).forEach(convertorField => {
      lookup[convertorField][conversionField] /= counts[fields[index + 1]];
    });
  });
  return lookup;
}, _.object(fields, fields.map(() => _.object(fields, new Array(fields.length).fill(1)))));

module.exports = class ObreonDate {
  constructor(data) {
    _.extend(this, _.pick(data, fields));
  }

  static get fields() {
    return fields;
  }

  get westernMonth() {
    if (!this.year || !this.month) {
      throw new Error('Can\'t calculate western month without year and month info');
    }

    const cycleYear = this.year % 11;
    return ((this.month + cycleYear * 10) % 11) || 11;
  }

  get nextDay() {
    return this.advance({ day: 1 });
  }

  advanceTo(newValues) {
    const firstFieldIndex = fields.findIndex(field => !_.isUndefined(newValues[field]));
    if (firstFieldIndex >= 0) {
      const field = fields[firstFieldIndex];
      const value = Math.min(maxima[field], newValues[field]);
      const diff = value - this[field];
      const advance = diff >= 0 ? diff : maxima[field] - this[field] + value;
      const remainingFields = fields.slice(firstFieldIndex + 1);
      const increment = {};
      increment[field] = advance;
      return this.advance(increment).change(_.pick(newValues, remainingFields));
    }
    return this;
  }

  advance(increments) {
    const incrementArray = fields.map(field => increments[field] || 0);

    const indexOfSmallestChangedField = _.findLastIndex(fields, field => increments[field]);


    const newVals = incrementArray.reduceRight((vals, increment, index) => {
      const field = fields[index];
      if (_.isUndefined(vals[field])) {
        if (index <= indexOfSmallestChangedField) {
          throw new Error(`Can't advance field ${field} because it has no value`);
        }
        return vals;
      }
      vals[field] += increment;
      if (vals[field] > maxima[field]) {
        const carry = Math.floor(vals[field] / counts[field]);
        vals[field] = vals[field] % counts[field];
        vals[fields[index - 1]] += carry;
      }

      return vals;
    }, _.defaults({}, this));

    return new ObreonDate(newVals);
  }

  change(newValues) {
    return new ObreonDate(_.defaults(newValues, this));
  }

  without(omitFields) {
    return new ObreonDate(_.omit(this, omitFields));
  }

  between(start, end) {
    if (!(start instanceof ObreonDate) || !(end instanceof ObreonDate)) {
      throw new Error(`Arguments to between must be of type ObreonDate ${start} ${end}`);
    }
    return (this.compare(start) >= 0 && this.compare(end) < 0) ||
      (end.compare(start) < 0 && (this.compare(start) >= 0 || this.compare(end) < 0));
  }

  compare(that, unitsField) {
    unitsField = unitsField || 'minute';
    const differences = fields.map(field =>
      (!_.isUndefined(this[field]) && !_.isUndefined(that[field]) ? this[field] - that[field] : 0));
    return differences.reduce((result, difference, index) =>
      result + difference * multipliers[fields[index]][unitsField],
      0);
  }

  equals(that) {
    return this.compare(that) === 0;
  }

  isNextDay(that) {
    const compareVal = this.compare(that, 'day');
    return compareVal < 2 && compareVal > 0 && (this.day - that.day === 1);
  }

  sameDay(that) {
    return this.day === that.day && Math.abs(this.compare(that, 'day')) < 1;
  }

  get endOfDay() {
    return this.change({ hour: maxima.hour, minute: maxima.minute });
  }

  get startOfDay() {
    return this.change({ hour: 0, minute: 0 });
  }

  get moonPhase() {
    if (this.day) {
      if (this.day < 3) {
        return 'new';
      }
      if (this.day < 6) {
        return 'waxing crescent';
      }
      if (this.day < 10) {
        return 'first quarter';
      }
      if (this.day < 14) {
        return 'waxing gibbous';
      }
      if (this.day < 17) {
        return 'full';
      }
      if (this.day < 21) {
        return 'waning gibbous';
      }
      if (this.day < 25) {
        return 'third quarter';
      }
      if (this.day < 29) {
        return 'waning crescent';
      }
      return 'new';
    }
    return 'unknown';
  }

  toString() {
    return `${this.year || '*'}/${this.month || '*'}/${this.day || '*'} ` +
      `${_.isUndefined(this.hour) ? '*' : this.hour}:${_.isUndefined(this.minute) ? '*' : zeroPad(this.minute)}`;
  }

  toDateString() {
    return `${this.year || '*'}/${this.month || '*'}/${this.day || '*'}`;
  }

  toTimeString() {
    return `${_.isUndefined(this.hour) ? '*' : this.hour}:${_.isUndefined(this.minute) ? '*' : zeroPad(this.minute)}`;
  }

  toLongString() {
    let string = '';
    if (!_.isUndefined(this.minute) && !_.isUndefined(this.hour)) {
      string = `${this.hour}:${zeroPad(this.minute)}`;
    }
    if (!_.isUndefined(this.day)) {
      string = string && `${string} on `;
      string += `${ObreonDate.DaysOfWeek[(this.day % 6)]} ${ObreonDate.getOrdinal(this.day)}`;
    }
    if (!_.isUndefined(this.month)) {
      string = string && `${string} of `;
      string += `${ObreonDate.Months[this.month]}`;
    }
    if (!_.isUndefined(this.year)) {
      string = string && `${string} in the year `;
      string += `${this.year} of the new era`;
    }
    return string;
  }

  static getOrdinal(number) {
    switch (number) {
      case 1:
        return '1st';
      case 2:
        return '2nd';
      case 3:
        return '3rd';
      default:
        return `${number}th`;
    }
  }

  static get Months() {
    return [
      'Primaluna',
      'Sequiluna',
      'Serimon',
      'Cereluna',
      'Canicula',
      'Nitimon',
      'Messiluna',
      'Casimon',
      'Oneirimon',
      'Selemon',
    ];
  }

  static get DaysOfWeek() {
    return [
      'Nildem',
      'Genedem',
      'Luctadem',
      'Obidem',
      'Ortidem',
      'Marcedem',
    ];
  }

  static fromString(dateString, defaults) {
    const re = /^(?:(\d{1,4}|\*)\/(\d{1,2}|\*)\/(\d{1,2}|\*)(?:\s|$))?(?:(\d{1,2}|\*):(\d\d))?$/;
    const match = dateString.match(re);

    if (match) {
      const parts = match.slice(1).map(part => (part === '*' || _.isUndefined(part) ? undefined : parseInt(part, 10)));
      if (_.any(parts, _.isNaN) || _.any(parts, (val, index) => val > maxima[fields[index]])) {
        throw new Error(`Bad date string: ${dateString}`);
      }

      const dataObject = parts.reduce((obj, val, index) => {
        if (!_.isUndefined(val)) {
          obj[fields[index]] = val;
        }
        return obj;
      }, {});

      return new ObreonDate(_.defaults(dataObject, defaults));
    }

    throw new Error(`Bad date string: ${dateString}`);
  }
};
