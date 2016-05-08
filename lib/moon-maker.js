'use strict';
const _ = require('underscore');

function calcInner(outerDiameter, semiPhase) {
  const absPhase = Math.abs(semiPhase);
  const n = ((1 - absPhase) * outerDiameter / 2) || 0.01;

  const innerRadius = n / 2 + outerDiameter * outerDiameter / (8 * n);

  return {
    d: innerRadius * 2,
    o: semiPhase > 0 ? (outerDiameter / 2 - n) : (-2 * innerRadius + outerDiameter / 2 + n),
  };
}


function drawDiscs(outer, inner, blurSize) {
  outer.css = {
    position: 'absolute',
    height: `${outer.diameter}px`,
    width: `${outer.diameter}px`,
    border: '1px solid black',
    'background-color': outer.colour,
    'border-radius': `${(outer.diameter / 2)}px`,
    overflow: 'hidden',
  };

  const blurredDiameter = inner.diameter - blurSize;
  const blurredOffset = inner.offset + blurSize / 2;

  inner.css = {
    position: 'absolute',
    'background-color': inner.colour,
    'border-radius': `${(blurredDiameter / 2)}px`,
    height: `${blurredDiameter}px`,
    width: `${blurredDiameter}px`,
    left: `${blurredOffset}px`,
    top: `${((outer.diameter - blurredDiameter) / 2)}px`,
    'box-shadow': `0px 0px ${blurSize}px ${blurSize}px ${inner.colour}`,
    opacity: inner.opacity,
  };
}


module.exports = function makeMoon(date) {
  const phase = (date.day - 1) / 14.5;
  return makeMoonHtml(phase > 1 ? 2 - phase : phase, phase < 1);
};

function makeMoonHtml(phase, isWaxing) {
  let outerColour;
  let innerColour;

  if (phase < 0.5) {
    outerColour = 'white';
    innerColour = 'black';
    if (isWaxing) {
      phase *= -1;
    }
  }
  else {
    outerColour = 'black';
    innerColour = 'white';
    phase = 1 - phase;
    if (!isWaxing) {
      phase *= -1;
    }
  }

  const innerVals = calcInner(25, phase * 2);

  const outer = {
    diameter: 25,
    colour: outerColour,
  };
  const inner = {
    diameter: innerVals.d,
    colour: innerColour,
    offset: innerVals.o,
    opacity: 0.9,
  };

  drawDiscs(outer, inner, 3);

  return `<div style="${_.map(outer.css, (val, key) => `${key}:${val}`).join(';')}">` +
    `<div style="${_.map(inner.css, (val, key) => `${key}:${val}`).join(';')}"></div></div>`;
}
