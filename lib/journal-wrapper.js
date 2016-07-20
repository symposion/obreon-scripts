'use strict';
const Journal = require('./journal');

module.exports = class JournalWrapper {
  constructor(journal, roll20, reporter, handout) {
    this.roll20 = roll20;
    this.journal = journal;
    this.reporter = reporter;
    if (!handout) {
      handout = this.roll20.createObj('handout', {
        name: `Journal:${this.journal.dateString}`,
        inplayerjournals: 'all',
      });
    }

    this.handout = handout;
  }

  static getWrapperPromise(roll20, reporter, handout) {
    return new Promise(resolve => {
      handout.get('gmnotes', gmnotes =>
        resolve(new JournalWrapper(Journal.parseFromJSON(gmnotes), roll20, reporter, handout))
      );
    });
  }

  save() {
    const writer = this.reporter.makeHandoutScrollWriter();
    this.journal.render(writer);
    writer.renderTo(this.handout);
    this.handout.set('name', `Journal:${this.journal.dateString}`);
    this.handout.set('gmnotes', JSON.stringify(this.journal));
  }

  static get logWrap() {
    return 'JournalWrapper';
  }
};
