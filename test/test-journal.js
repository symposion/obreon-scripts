/* globals describe: false, it:false */
'use strict';
const expect = require('chai').expect;
const ObreonDate = require('../lib/obreon-date');
const Journal = require('../lib/journal');
const ClimateModel = require('../lib/weather-handler');
const dl = require('./dummy-logger');
const DiceRoller = require('../lib/dice-roller');
const sinon = require('sinon');
const Reporter = require('../lib/reporter');
const Roll20Object = require('./dummy-roll20-object');

function d(dateString) {
  return ObreonDate.fromString(dateString);
}

describe('Journal', function () {
  const dr = new DiceRoller(null);
  sinon.stub(dr, 'roll');
  dr.roll.withArgs('1d24').returns(24);
  dr.roll.withArgs('1d6-2').returns(4);
  ClimateModel.registerClimateModel(require('../lib/osherion-climate'), dr, dl);
  const climateModel = ClimateModel.getClimateModel('OsherionClimate');

  describe('#constructor', function () {
    it('makes new ones', function () {
      const j = new Journal('Tinderspring', d('2863/05/01 12:00'));
      j.activity({ hour: 4 }, 'Bumbling around');
      j.travel({ hour: 18 }, 'Qidiraethon');
      j.weather(d('2863/05/02 8:00'), climateModel.getWeatherForDay(d('2863/05/02')));
      expect(j._entries).to.have.lengthOf(4);
      expect(j.end).to.deep.equal(d('2863/05/02 10:00'));
    });
  });

  describe('json processing', function () {
    it('serialises and deserialises correctly', function () {
      const j = new Journal('Tinderspring', d('2863/05/01 12:00'));
      j.activity({ hour: 4 }, 'Bumbling around');
      j.travel({ hour: 18 }, 'Qidiraethon');
      j.weather(d('2863/05/02 8:00'), climateModel.getWeatherForDay(d('2863/05/02')));

      const string = JSON.stringify(j);
      const rehydrated = Journal.parseFromJSON(string);
      expect(rehydrated).to.deep.equal(j);
    });
  });

  describe('day splitting', function () {
    it('splits into days correctly', function () {
      const j = new Journal('Tinderspring', d('2863/05/01 12:00'));
      j.activity({ hour: 4 }, 'Bumbling around');
      j.travel({ hour: 18 }, 'Qidiraethon');
      const weather = climateModel.getWeatherForDay(d('2863/05/02'));
      j.weather(d('2863/05/02 8:00'), weather);
      j.travel({ day: 2 }, 'Vulturnium');
      let newWeather = climateModel.getNextDayWeather(weather, d('2863/05/03'));
      j.weather(d('2863/05/03 8:00'), newWeather);
      newWeather = climateModel.getNextDayWeather(newWeather, d('2863/05/04'));
      j.weather(d('2863/05/04 8:00'), newWeather);
      const split = j.splitByDay();
      const aggregate = split[0].aggregate(split.slice(1));
      expect(aggregate).to.deep.equal(j);

      const result = Journal.aggregate(split.map(journal => Journal.parseFromJSON(JSON.stringify(journal))));
      expect(result).to.deep.equal(j);
    });
  });

  describe('rendering', function () {
    const reporter = new Reporter();
    it('renders correctly', function () {
      const output = new Roll20Object('handout');
      const j = new Journal('Tinderspring', d('2863/05/01 12:00'));
      j.activity({ hour: 4 }, 'Bumbling around');
      j.travel({ hour: 18 }, 'Qidiraethon');
      const weather = climateModel.getWeatherForDay(d('2863/05/02'));
      j.weather(d('2863/05/02 8:00'), weather);
      j.travel({ day: 2 }, 'Vulturnium');
      let newWeather = climateModel.getNextDayWeather(weather, d('2863/05/03'));
      j.weather(d('2863/05/03 8:00'), newWeather);
      newWeather = climateModel.getNextDayWeather(newWeather, d('2863/05/04'));
      j.weather(d('2863/05/04 8:00'), newWeather);
      const writer = reporter.makeHandoutScrollWriter();
      j.render(writer);
      writer.renderTo(output);
      console.log(output.props.notes);
    });
  });
});
