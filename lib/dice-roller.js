'use strict';

// noinspection JSUnusedLocalSymbols
module.exports = class DiceRoller {
  constructor(roll20) {
    this.roll20 = roll20;
  }

  roll(diceExpression) {
    const diceReplaced = diceExpression.replace(/(\d+)d(\d+)/, (match, dieCount, dieSize) =>
      `${dieCount} * ${this.roll20.randomInteger(dieSize)}`
    );

    // eslint-disable-next-line
    return eval(diceReplaced);
  }
};
