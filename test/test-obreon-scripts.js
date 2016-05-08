/* globals describe: false, it:false, before:false, after:false */
'use strict';
const expect = require('chai').expect;
const ObreonScripts = require('../lib/obreon-scripts');
const dl = require('./dummy-logger');
const Roll20 = require('roll20-wrapper');
const sinon = require('sinon');
const Roll20Object = require('./dummy-roll20-object');
const DiceRoller = require('../lib/dice-roller');
const _ = require('underscore');
const Reporter = require('../lib/reporter');

function replaceReporter(os) {
  const reporter = new Reporter();
  reporter.report = _.noop;
  reporter.messages = [];
  const oldMakeMessage = reporter.makeScrollMessage;
  reporter.makeScrollMessage = function makeScrollMessage() {
    const message = oldMakeMessage.apply(this, arguments);
    this.messages.push(message);
    return message;
  };
  os.reporter = reporter;
}


describe('ObreonScripts', function () {
  const moonMaker = _.constant('<div style="">moonPhase</div>');

  describe('#recordActivity', function () {
    it('updates within day journal', function () {
      const roll20 = new Roll20();
      const roll20Mock = sinon.mock(roll20);
      roll20Mock.expects('getState').returns({});

      const os = new ObreonScripts(roll20, dl, moonMaker);
      replaceReporter(os);

      const prevHandout = new Roll20Object('handout');
      prevHandout.set('name', 'Journal:2863/4/18');
      prevHandout.set('gmnotes', 'WEATHER:{"days":[{"temp":"26", "subModel":"base"}]}');
      prevHandout.set('notes', '0:00-12:00: Bumbled about a bit');


      roll20Mock.expects('findObjs').withArgs({ type: 'handout' }).returns([prevHandout]);

      return os.recordActivity({ duration: [{ hour: 2 }], text: 'Did some more stuff', location: 'Tinderspring' })
        .then(() => {
          roll20Mock.verify();
          expect(prevHandout.props.notes).to.match(/12:00-14:00: Did some more stuff<br>Location: Tinderspring/);
          expect(os.reporter.messages).to.have.lengthOf(1);
          expect(os.reporter.messages[0]).to.have.property('text',
            'Journal for 2863/4/18 updated with new entry<br>' +
            'It\'s 14:00 on Nildem 18th of Cereluna in the year 2863 of the new era. ' +
            'You are at Tinderspring. ' +
            'The weather is largely clear and the maximum temperature is 26');
        });
    });

    it('creates day spanning journal', function () {
      const dr = new DiceRoller(null);
      sinon.stub(dr, 'roll');
      const roll20 = new Roll20();
      const roll20Mock = sinon.mock(roll20);
      roll20Mock.expects('getState').returns({});

      const os = new ObreonScripts(roll20, dl, moonMaker);
      os.diceRoller = dr;
      replaceReporter(os);

      const prevHandout = new Roll20Object('handout');
      prevHandout.set('name', 'Journal:2863/4/18');
      prevHandout.set('gmnotes', 'WEATHER:{"days":[{"temp":"26", "subModel":"base"}]}');
      prevHandout.set('notes', 'Location: Tinderspring<br>0:00-12:00: Bumbled about a bit');
      const newHandout = new Roll20Object('handout');
      newHandout.set('name', 'Journal:2863/4/19');
      newHandout.set('inplayerjournals', 'all');
      const weather = {
        days: [
          {
            date: {
              year: 2863,
              month: 4,
              day: 19,
            },
            subModel: 'springRains1',
            temp: 20,
          },
        ],
      };
      roll20Mock.expects('findObjs').withArgs({ type: 'handout' }).returns([prevHandout]);
      dr.roll.withArgs('1d6').returns(Promise.resolve(3));
      dr.roll.withArgs('0-1d6').returns(Promise.resolve(-3));

      roll20Mock.expects('createObj').withArgs('handout',
        newHandout.props).returns(newHandout);

      return os.recordActivity({ duration: [{ hour: 24 }], text: 'My test text' })
        .then(() => {
          roll20Mock.verify();
          expect(newHandout.props.notes).to.match(/0:00-12:00: My test text \(end\)/);
          expect(prevHandout.props.notes).to.match(/12:00-23:59: My test text \(start\)/);
          expect(newHandout.props.notes)
            .to.match(/The moon is waning gibbous. The weather is largely clear and the maximum temperature is 26/);
          expect(newHandout.props.notes).to.match(/Location: Tinderspring/);
          expect(newHandout.props.gmnotes).to.equal(`WEATHER:${JSON.stringify(weather)}`);
          expect(os.reporter.messages).to.have.lengthOf(1);
          expect(os.reporter.messages[0]).to.have.property('text',
            'Journal for 2863/4/18 completed and new entry started for 2863/4/19<br>' +
            'It\'s 12:00 on Genedem 19th of Cereluna in the year 2863 of the new era. ' +
            'You are at Tinderspring. ' +
            'The weather is clouding over, threat of rain and the maximum temperature is 20');
        });
    });

    it('creates multi day spanning journal', function () {
      const dr = new DiceRoller(null);
      sinon.stub(dr, 'roll');
      const roll20 = new Roll20();
      const roll20Mock = sinon.mock(roll20);
      roll20Mock.expects('getState').returns({});

      const os = new ObreonScripts(roll20, dl, moonMaker);
      os.diceRoller = dr;
      replaceReporter(os);

      const prevHandout = new Roll20Object('handout');
      prevHandout.set('name', 'Journal:2863/4/18');
      prevHandout.set('gmnotes', 'WEATHER:{"days":[{"temp":"26", "subModel":"base"}]}');
      prevHandout.set('notes', 'Location: Tinderspring<br>0:00-12:00: Bumbled about a bit');
      const newHandout = new Roll20Object('handout');
      newHandout.set('name', 'Journal:2863/4/19-2863/4/20');
      newHandout.set('inplayerjournals', 'all');
      const weather = {
        days: [
          {
            date: {
              year: 2863,
              month: 4,
              day: 19,
            },
            subModel: 'viridantis:base',
            temp: 24,
          },
          {
            date: {
              year: 2863,
              month: 4,
              day: 20,
            },
            subModel: 'viridantis:base',
            temp: 23,
          },
        ],
      };
      roll20Mock.expects('findObjs').withArgs({ type: 'handout' }).returns([prevHandout]);
      dr.roll.withArgs('1d6').returns(Promise.resolve(4));
      dr.roll.withArgs('1d6-2').returns(Promise.resolve(3));

      roll20Mock.expects('createObj').withArgs('handout',
        newHandout.props).returns(newHandout);

      return os.recordActivity({ duration: [{ hour: 48 }], text: 'Journey to Qidiraethon', location: 'Qidiraethon' })
        .then(() => {
          roll20Mock.verify();
          expect(newHandout.props.notes).to.match(/2863\/4\/19 0:00-2863\/4\/20 12:00: Journey to Qidiraethon \(end\)/);
          expect(prevHandout.props.notes).to.match(/12:00-23:59: Journey to Qidiraethon \(start\)/);
          expect(newHandout.props.notes)
            .to.match(/The weather is largely clear and the maximum temperature is 24/);
          expect(newHandout.props.notes).to.match(/Location: Qidiraethon/);
          expect(newHandout.props.gmnotes).to.equal(`WEATHER:${JSON.stringify(weather)}`);
          expect(os.reporter.messages).to.have.lengthOf(1);
          expect(os.reporter.messages[0]).to.have.property('text',
            'Journal for 2863/4/18 completed and new entry started for 2863/4/19<br>' +
            'It\'s 12:00 on Luctadem 20th of Cereluna in the year 2863 of the new era. ' +
            'You are at Qidiraethon. ' +
            'The weather is largely clear and the maximum temperature is 23');
        });
    });
  });


  describe('#handleInput', function () {
    it('processes commands correctly', function () {
      const roll20 = new Roll20();
      sinon.stub(roll20);
      roll20.getState.returns({});

      const os = new ObreonScripts(roll20, dl, moonMaker);
      let resultingOptions;
      sinon.stub(os, 'recordActivity', options => {
        resultingOptions = options;
      });

      os.registerEventHandlers();
      os.handleInput({ content: '!obreon-record-activity --text my Text --hour 2', type: 'api' });
      // noinspection JSUnusedAssignment
      expect(resultingOptions).to.have.property('text', 'my Text');
    });
  });

  describe('#motd', function () {
    let clock;

    before(function () {
      clock = sinon.useFakeTimers();
    });

    after(function () {
      clock.restore();
    });

    it('displays motd', function () {
      const roll20 = new Roll20();
      const roll20Mock = sinon.mock(roll20);
      roll20Mock.expects('getState').returns({});

      const os = new ObreonScripts(roll20, dl, moonMaker);
      replaceReporter(os);


      const prevHandout = new Roll20Object('handout');
      prevHandout.set('name', 'Journal:2863/4/18');
      prevHandout.set('gmnotes', 'WEATHER:{"days":[{"temp":"26", "subModel":"base"}]}');
      prevHandout.set('notes', 'Location: Tinderspring<br>0:00-12:00: Bumbled about a bit');
      roll20Mock.expects('findObjs').withArgs({ type: 'handout' }).returns([prevHandout]).atLeast(1);

      const player = new Roll20Object('player');
      player.set('online', true);
      player.set('displayname', 'player');
      return os.displayMotd(player, { _online: false })
        .then(() => {
          clock.tick(5000);
          roll20Mock.verify();
          expect(os.reporter.messages).to.have.lengthOf(1);
          expect(os.reporter.messages[0]).to.have.property('text',
            'Welcome player!<br>It\'s 12:00 on Nildem 18th of Cereluna in the year 2863 of the new era. ' +
            'You are at Tinderspring. ' +
            'The weather is largely clear and the maximum temperature is 26');
        });
    });
  });
});
