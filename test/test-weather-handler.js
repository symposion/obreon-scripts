/* globals describe: false, it:false */
'use strict';
const expect = require('chai').expect;
const ClimateModel = require('../lib/weather-handler');
const osherion = require('../lib/osherion-climate');
const sinon = require('sinon');
const DiceRoller = require('../lib/dice-roller');
const ObreonDate = require('../lib/obreon-date');

describe('WeatherHandler', function () {
  describe('ClimateModel', function () {
    it('works', function () {
      const dr = new DiceRoller(null);
      sinon.stub(dr, 'roll');
      const cm = new ClimateModel(osherion, dr);
      let date = ObreonDate.fromString('1000/01/01');
      const ws = cm.getWeatherForDay(date);
      expect(ws.temp).to.equal(6);
      expect(ws.subModel.weather).to.equal('dry');

      dr.roll.withArgs('1d18').returns(2);
      dr.roll.withArgs('0-1d6-2').returns(-8);
      date = date.nextDay;
      let newWs = cm.getNextDayWeather(ws, date);
      expect(newWs.subModel.weather).to.equal('crisp and icy');
      expect(newWs.temp).to.equal(-4);
      dr.roll.withArgs('1d8').returns(3);
      dr.roll.withArgs('0-1d6-2').returns(-10);
      date = date.nextDay;
      newWs = cm.getNextDayWeather(newWs, date);
      expect(newWs.subModel.weather).to.equal('overcast and snowing');
      expect(newWs.temp).to.equal(-8);
      dr.roll.withArgs('1d10').returns(6);
      dr.roll.withArgs('0-1d6-4').returns(-10);
      date = date.nextDay;
      newWs = cm.getNextDayWeather(newWs, date);
      expect(newWs.subModel.weather).to.equal('BLIZZARD!');
      expect(newWs.temp).to.equal(-11);
      dr.roll.withArgs('1d6').returns(1);
      dr.roll.withArgs('1d6-3').returns(-1);
      date = date.nextDay;
      newWs = cm.getNextDayWeather(newWs, date);
      expect(newWs.subModel.weather).to.equal('dry');
      expect(newWs.temp).to.equal(-5);
    });
  });

  describe('functionTest', function () {
    const dr = {
      roll(diceExpr) {
        return resolveDiceExpr(diceExpr);
      },
    };

    it('works', function () {
      const cm = new ClimateModel(osherion, dr);
      let date = ObreonDate.fromString('1000/01/01');
      let weather = cm.getWeatherForDay(date);
      for (let i = 0; i < 300; i++) {
        date = date.nextDay;
        weather = cm.getNextDayWeather(weather, date);
      }
    });
  });
});

function resolveDiceExpr(diceExpr) {
  let newExp = diceExpr.replace(/1d5r3-3(.*)/, '(Math.round((Math.random()*4))-2)$1');
  newExp = newExp.replace(/(?:0)?([-\d]+)d(\d+)(.*)/, function (match, dieCount, dieSize, mods) {
    return `(Math.round(Math.random() * ${dieSize} + 0.5) * ${dieCount}) ${mods}`;
  });
  return eval(newExp); // eslint-disable-line
}
