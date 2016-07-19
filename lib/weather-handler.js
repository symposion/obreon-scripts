'use strict';
const ObreonDate = require('./obreon-date');
const _ = require('underscore');

const climateGraphics = {
  thunder: 'https://s3.amazonaws.com/files.d20.io/images/18841545/oYEnmbanwtbR58-mmNM5gQ/thumb.png?1462712161',
  snow: 'https://s3.amazonaws.com/files.d20.io/images/18841525/DpeyhejYYcz-xIW1Rq1C9w/thumb.png?1462712141',
  rain: 'https://s3.amazonaws.com/files.d20.io/images/18841517/MEHXoYdLpnfJhXT4fxEPTg/thumb.png?1462712125',
  cloud: 'https://s3.amazonaws.com/files.d20.io/images/18841513/2A0fORfTOoiLmCn-RFt4ig/thumb.png?1462712110',
  sun: 'https://s3.amazonaws.com/files.d20.io/images/18841509/eEv49yA2yT4buh2a5WHrRg/thumb.png?1462712094',
};

const climateModels = {};

class WeatherState {
  constructor(climateModel, subModel, temp) {
    this.climateModel = climateModel;
    this.subModel = subModel;
    this.temp = temp;
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
      subModel: this.subModel.name,
      temp: this.temp,
      climateModel: this.climateModel.weatherData.name,
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
  constructor(weatherData, diceRoller) {
    this.weatherData = weatherData;
    _.each(weatherData.subModels, (model, name) => (model.name = name));
    _.each(weatherData.seasons, (season) => {
      season.baseModel.name = `${season.name.toLowerCase()}:base`;
      weatherData.subModels[season.baseModel.name] = season.baseModel;
    });
    this.diceRoller = diceRoller;
  }

  getNextDayWeather(weatherState, newDate) {
    const newSubModel = this.getNextSubmodel(weatherState.subModel, newDate);

    const tempChange = this.diceRoller.roll(`${newSubModel.tempIncrease}`);
    const newTemp = tempChange + weatherState.temp;
    const avgTemp = this.getAvgTempFor(newSubModel, newDate);
    const deviation = avgTemp - newTemp;
    const bias = Math.round(deviation / 2.5);
    return new WeatherState(this, newSubModel, newTemp + bias);
  }

  getWeatherForDay(date) {
    const seasonInfo = this.getSeasonFor(date);
    const subModel = seasonInfo.baseModel;
    return new WeatherState(this, subModel, this.getAvgTempFor(subModel, date));
  }

  getNextSubmodel(subModel, date) {
    let next = subModel.nextDefault;
    if (subModel.nextRoll) {
      const rollResult = this.diceRoller.roll(subModel.nextRoll);
      if (rollResult <= subModel.nextSpecials.length) {
        next = subModel.nextSpecials[rollResult - 1];
      }
    }
    return this.resolveSubModelName(next, date);
  }

  resolveSubModelName(name, date) {
    if (name === 'base') {
      if (!date) {
        throw new Error('Date must be supplied if bare base season is requested');
      }
      return this.getSeasonFor(date).baseModel;
    }
    return this.weatherData.subModels[name];
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

  getWeatherState(stateObject) {
    const subModel = (typeof stateObject.subModel === 'string') ?
      this.resolveSubModelName(stateObject.subModel) : stateObject.subModel;

    const temp = parseInt(stateObject.temp, 10);

    return new WeatherState(
      this,
      subModel,
      temp
    );
  }

  static registerClimateModel(weatherData, diceRoller, logger) {
    climateModels[weatherData.name] = new ClimateModel(weatherData, diceRoller);
    logger.wrapModule(climateModels[weatherData.name]);
  }

  static getClimateModel(climateModelName) {
    return climateModels[climateModelName];
  }

  get logWrap() {
    return 'ClimateModel';
  }
}

module.exports = ClimateModel;
