'use strict';

// noinspection JSUnusedLocalSymbols
module.exports = class DiceRoller {
  constructor(roll20) {
    this.roll20 = roll20;
  }

  roll(diceExpression) {
    return new Promise((resolve, reject) => {
      this.roll20.sendChat('', `/gmroll ${diceExpression}`, msg => {
        if (msg[0].type === 'error') {
          return reject(msg.content);
        }
        return resolve(JSON.parse(msg[0].content).total);
      });
    });
  }
};
