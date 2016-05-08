/* globals describe: false, it:false */
'use strict';
const expect = require('chai').expect;
const ObreonDate = require('../lib/obreon-date');

function d(dateString) {
  return ObreonDate.fromString(dateString);
}

describe('ObreonDate', function () {
  describe('#compare', function () {
    it('gives 0 for equal', function () {
      expect(ObreonDate.fromString('1000/01/01').compare(ObreonDate.fromString('1000/01/01'))).to.equal(0);
    });

    it('gives 0 for match against partial date', function () {
      expect(ObreonDate.fromString('1000/01/01').compare(ObreonDate.fromString('1000/01/*'))).to.equal(0);
    });

    it('gives negative for lesser date', function () {
      expect(ObreonDate.fromString('999/01/01').compare(ObreonDate.fromString('1000/01/01'))).to.be.lessThan(0);
    });

    it('gives positive for greater date', function () {
      expect(ObreonDate.fromString('1000/01/03').compare(ObreonDate.fromString('1000/01/01'))).to.be.greaterThan(0);
    });

    it('gives positive for greater than partial date', function () {
      expect(ObreonDate.fromString('1000/01/03').compare(ObreonDate.fromString('*/01/01'))).to.be.greaterThan(0);
    });

    it('compares accurately in minutes', function () {
      expect(ObreonDate.fromString('1000/01/01').compare(ObreonDate.fromString('1001/01/01'))).to.equal(-432000);
    });

    it('compares accurately in years', function () {
      expect(ObreonDate.fromString('1000/01/01').compare(ObreonDate.fromString('1001/01/01'), 'year')).to.equal(-1);
    });
  });

  describe('#without', function () {
    it('deletes unwanted', function () {
      expect(ObreonDate.fromString('1000/03/01 12:00').without(['hour', 'minute']))
        .to.deep.equal(ObreonDate.fromString('1000/03/01'));
    });
  });

  describe('#isNextDay', function () {
    it('checks days correctly', function () {
      expect(d('1000/03/02 00:00').isNextDay(d('1000/03/01 00:00'))).to.be.true;
    });
  });

  describe('#sameDay', function () {
    it('works correctly', function () {
      expect(ObreonDate.fromString('1000/03/01 12:00').sameDay(ObreonDate.fromString('1000/03/01 00:00'))).to.be.true;
      expect(ObreonDate.fromString('1000/03/01 12:00').sameDay(ObreonDate.fromString('1001/03/01 12:00'))).to.be.false;
    });
  });

  describe('#between', function () {
    it('gives true for simple between', function () {
      const start = ObreonDate.fromString('1000/02/01');
      const end = ObreonDate.fromString('1000/04/01');
      expect(ObreonDate.fromString('1000/03/01').between(start, end)).to.be.true;
    });

    it('gives false for wrapAround case', function () {
      const start = ObreonDate.fromString('*/04/01');
      const end = ObreonDate.fromString('*/02/01');
      expect(ObreonDate.fromString('1000/03/01').between(start, end)).to.be.false;
    });

    it('gives true for wrapAround case', function () {
      const start = ObreonDate.fromString('*/04/01');
      const end = ObreonDate.fromString('*/02/01');
      expect(ObreonDate.fromString('1000/05/01').between(start, end)).to.be.true;
    });
  });

  describe('#advance', function () {
    it('advances several months in days', function () {
      expect(ObreonDate.fromString('1000/03/01').advance({ day: 62 }))
        .to.deep.equal(ObreonDate.fromString('1000/05/03'));
    });

    it('advances 24 hours', function () {
      expect(ObreonDate.fromString('1000/03/01').startOfDay.advance({ hour: 24 }))
        .to.deep.equal(ObreonDate.fromString('1000/03/02 0:00'));
    });
  });

  describe('#advanceTo', function () {
    it('advances', function () {
      expect(ObreonDate.fromString('1000/03/01').advanceTo({ month: 4, day: 2 }))
        .to.deep.equal(ObreonDate.fromString('1000/04/02'));
    });
    it('advances wrap around', function () {
      expect(ObreonDate.fromString('1000/03/30').advanceTo({ month: 2, day: 2 }))
        .to.deep.equal(ObreonDate.fromString('1001/02/02'));
    });
  });

  describe('#nextDay', function () {
    it('increments day', function () {
      expect(ObreonDate.fromString('1000/03/01').nextDay).to.deep.equal(ObreonDate.fromString('1000/03/02'));
    });
    it('rolls over month', function () {
      expect(ObreonDate.fromString('1000/03/30').nextDay).to.deep.equal(ObreonDate.fromString('1000/04/01'));
    });
    it('rolls over year', function () {
      expect(ObreonDate.fromString('1000/10/30').nextDay).to.deep.equal(ObreonDate.fromString('1001/01/01'));
    });
  });

  describe('#fromString', function () {
    it('throws errors for bad values', function () {
      expect(() => ObreonDate.fromString('1000/31/01')).to.throw(Error);
      expect(() => ObreonDate.fromString('1000/20/42')).to.throw(Error);
      expect(() => ObreonDate.fromString('1000/20/01 24:00')).to.throw(Error);
      expect(() => ObreonDate.fromString('1000/20/01 23:61')).to.throw(Error);
      expect(() => ObreonDate.fromString('1000/20/01 xx:50')).to.throw(Error);
    });

    it('fills in defaults', function () {
      expect(ObreonDate.fromString('1000/01/10', { hour: 8, minute: 0 }))
        .to.deep.equal(ObreonDate.fromString('1000/01/10 8:00'));
    });
  });

  describe('#advance', function () {
    it('advances correctly', function () {
      expect(ObreonDate.fromString('2350/09/29 05:01').advance({ day: 2 }))
        .to.deep.equal(ObreonDate.fromString('2350/10/01 05:01'));
    });
  });

  describe('#westernMonth', function () {
    it('calculates correctly for first year', function () {
      expect(ObreonDate.fromString('2849/01/01').westernMonth).to.equal(1);
      expect(ObreonDate.fromString('2849/10/01').westernMonth).to.equal(10);
    });

    it('calculates correctly for second year', function () {
      expect(ObreonDate.fromString('2850/01/01').westernMonth).to.equal(11);
      expect(ObreonDate.fromString('2850/02/01').westernMonth).to.equal(1);
      expect(ObreonDate.fromString('2850/10/01').westernMonth).to.equal(9);
    });

    it('calculates correctly for third year', function () {
      expect(ObreonDate.fromString('2851/01/01').westernMonth).to.equal(10);
      expect(ObreonDate.fromString('2851/02/01').westernMonth).to.equal(11);
      expect(ObreonDate.fromString('2851/10/01').westernMonth).to.equal(8);
    });

    it('calculates correctly for tenth year', function () {
      expect(ObreonDate.fromString('2858/01/01').westernMonth).to.equal(3);
      expect(ObreonDate.fromString('2858/02/01').westernMonth).to.equal(4);
      expect(ObreonDate.fromString('2858/10/01').westernMonth).to.equal(1);
    });

    it('calculates correctly for final year', function () {
      expect(ObreonDate.fromString('2859/01/01').westernMonth).to.equal(2);
      expect(ObreonDate.fromString('2859/02/01').westernMonth).to.equal(3);
      expect(ObreonDate.fromString('2859/10/01').westernMonth).to.equal(11);
    });

    it('calculates correctly for first year of next cycle', function () {
      expect(ObreonDate.fromString('2860/01/01').westernMonth).to.equal(1);
    });
  });
});
