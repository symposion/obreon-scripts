'use strict';
const ObreonDate = require('./obreon-date');
const osherionClimate = require('./osherion-climate');
const _ = require('underscore');

const climateGraphics = {
  thunder: 'https://s3.amazonaws.com/files.d20.io/images/18841545/oYEnmbanwtbR58-mmNM5gQ/thumb.png?1462712161',
  snow: 'https://s3.amazonaws.com/files.d20.io/images/18841525/DpeyhejYYcz-xIW1Rq1C9w/thumb.png?1462712141',
  rain: 'https://s3.amazonaws.com/files.d20.io/images/18841517/MEHXoYdLpnfJhXT4fxEPTg/thumb.png?1462712125',
  cloud: 'https://s3.amazonaws.com/files.d20.io/images/18841513/2A0fORfTOoiLmCn-RFt4ig/thumb.png?1462712110',
  sun: 'https://s3.amazonaws.com/files.d20.io/images/18841509/eEv49yA2yT4buh2a5WHrRg/thumb.png?1462712094',
};

class WeatherState {
  constructor(date, climateModel, subModel, temp) {
    if (!date) {
      throw new Error('Date is required');
    }
    date = date.without(['hour', 'minute']);
    this.climateModel = climateModel;
    this.subModel = !subModel || (typeof subModel === 'string') ?
      this.climateModel.resolveSubModelName(subModel, date) : subModel;
    this.temp = !_.isUndefined(temp) ? parseInt(temp, 10) : climateModel.getAvgTempFor(this.subModel, date);
    this.date = date;
  }

  getNextDayWeatherPromise() {
    return this.climateModel.getNextDayWeatherPromise(this);
  }


  getWeatherText(tempAdjust) {
    return `The weather is ${this.subModel.weather} and the maximum temperature is ${this.temp + (tempAdjust || 0)}`;
  }

  getWeatherGraphic() {
    return climateGraphics[this.subModel.graphicName];
  }

  get logWrap() {
    return 'WeatherState';
  }

  toJSON() {
    return {
      date: this.date,
      subModel: this.subModel.name,
      temp: this.temp,
    };
  }
}

const westernMonthTempAdjusts = {
  1: -1,
  2: -1,
  3: 0,
  4: 0,
  5: 0,
  6: 1,
  7: 1,
  8: 0,
  9: 0,
  10: 0,
  11: -1,
};

class ClimateModel {
  constructor(diceRoller) {
    this.weatherData = osherionClimate;
    _.each(osherionClimate.subModels, (model, name) => (model.name = name));
    _.each(osherionClimate.seasons, (season) => (season.baseModel.name = `${season.name.toLowerCase()}:base`));
    this.diceRoller = diceRoller;
  }

  getNextDayWeatherPromise(weatherState) {
    const newDate = weatherState.date.nextDay;

    const subModelPromise = this.getNextSubmodelPromise(weatherState.subModel, newDate);

    const tempChangePromise = subModelPromise
      .then(newSubModel => this.diceRoller.roll(`${newSubModel.tempIncrease}`));

    return Promise.all([subModelPromise, tempChangePromise])
      .then(results => {
        const newSubModel = results[0];
        const newTemp = results[1] + weatherState.temp;
        const avgTemp = this.getAvgTempFor(newSubModel, newDate);
        const deviation = avgTemp - newTemp;
        const bias = Math.round(deviation / 2.5);
        return new WeatherState(newDate, this, newSubModel, newTemp + bias);
      });
  }

  getWeatherForDay(date) {
    const seasonInfo = this.getSeasonFor(date);
    const subModel = seasonInfo.baseModel;
    return new WeatherState(date, this, subModel, this.getAvgTempFor(subModel, date));
  }

  getNextSubmodelPromise(subModel, date) {
    let next = Promise.resolve(subModel.nextDefault);
    if (subModel.nextRoll) {
      next = this.diceRoller.roll(subModel.nextRoll)
        .then(rollResult => {
          if (rollResult <= subModel.nextSpecials.length) {
            return subModel.nextSpecials[rollResult - 1];
          }
          return subModel.nextDefault;
        });
    }

    return next.then(nextModel => this.resolveSubModelName(nextModel, date));
  }

  resolveSubModelName(name, date) {
    name = name || 'base';
    const parts = name.split(':');
    const subModelName = parts.pop();
    const seasonName = parts.pop();
    const seasonInfo = this.weatherData.seasons[seasonName] || this.getSeasonFor(date);

    return (subModelName === 'base') ? seasonInfo.baseModel : this.weatherData.subModels[subModelName];
  }

  getSeasonFor(date) {
    if (!date || !(date instanceof ObreonDate)) {
      throw new Error(`Invalid argument ${JSON.stringify(date)} to getSeasonFor`);
    }
    return this.weatherData.seasons.find(seasonData => date.between(seasonData.start, seasonData.end));
  }

  getAvgTempFor(subModel, date) {
    const seasonInfo = this.getSeasonFor(date);
    const tempAdjust = westernMonthTempAdjusts[date.westernMonth];
    const max = subModel.maxTemp || seasonInfo.maxTemp;
    const min = subModel.minTemp || seasonInfo.minTemp;
    return Math.round((max + min) / 2 + tempAdjust);
  }

  static getWeatherState(stateObject, diceRoller) {
    return new WeatherState(new ObreonDate(stateObject.date),
      new ClimateModel(diceRoller),
      stateObject.subModel,
      stateObject.temp
    );
  }

  get logWrap() {
    return 'ClimateModel';
  }
}

module.exports = ClimateModel;
