/* globals describe: false, it:false */
'use strict';
const expect = require('chai').expect;
const ClimateModel = require('../lib/weather-handler');
const sinon = require('sinon');
const DiceRoller = require('../lib/dice-roller');
const ObreonDate = require('../lib/obreon-date');
const _ = require('underscore');

describe('WeatherHandler', function () {
  describe('ClimateModel', function () {
    it('works', function () {
      const dr = new DiceRoller(null);
      sinon.stub(dr, 'roll');
      const cm = new ClimateModel(dr);
      const ws = cm.getWeatherForDay(ObreonDate.fromString('1000/01/01'));
      expect(ws.temp).to.equal(6);
      expect(ws.subModel.weather).to.equal('dry');

      dr.roll.withArgs('1d18').returns(Promise.resolve(2));
      dr.roll.withArgs('0-1d6-2').returns(Promise.resolve(-8));
      return cm.getNextDayWeatherPromise(ws)
        .then(newWs => {
          expect(newWs.subModel.weather).to.equal('crisp and icy');
          expect(newWs.temp).to.equal(-4);
          return newWs;
        })
        .then(newWs => {
          dr.roll.withArgs('1d8').returns(Promise.resolve(3));
          dr.roll.withArgs('0-1d6-2').returns(Promise.resolve(-10));
          return cm.getNextDayWeatherPromise(newWs);
        })
        .then(newWs => {
          expect(newWs.subModel.weather).to.equal('overcast and snowing');
          expect(newWs.temp).to.equal(-8);
          return newWs;
        })
        .then(newWs => {
          dr.roll.withArgs('1d10').returns(Promise.resolve(5));
          dr.roll.withArgs('0-1d6-4').returns(Promise.resolve(-10));
          return cm.getNextDayWeatherPromise(newWs);
        })
        .then(newWs => {
          expect(newWs.subModel.weather).to.equal('BLIZZARD!');
          expect(newWs.temp).to.equal(-11);
          return newWs;
        })
        .then(newWs => {
          dr.roll.withArgs('1d6').returns(Promise.resolve(1));
          dr.roll.withArgs('1d6-3').returns(Promise.resolve(-1));
          return cm.getNextDayWeatherPromise(newWs);
        })
        .then(newWs => {
          expect(newWs.subModel.weather).to.equal('dry');
          expect(newWs.temp).to.equal(-5);
          return newWs;
        });
    });
  });

  describe('functionTest', function () {
    const dr = {
      roll(diceExpr) {
        return Promise.resolve(resolveDiceExpr(diceExpr));
      },
    };

    it('works', function () {
      const cm = new ClimateModel(dr);
      return _.range(1, 300)
        .reduce((promise) =>
            promise.then(newWs => newWs.getNextDayWeatherPromise())
          , Promise.resolve(cm.getWeatherForDay(ObreonDate.fromString('1000/01/01'))));
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
