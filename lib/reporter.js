'use strict';
// noinspection JSUnusedLocalSymbols
module.exports = class Reporter {
  constructor(roll20, logger) {
    this.roll20 = roll20;
    this.logger = logger;
  }

  makeScrollMessage() {
    return new ScrollMessage(this);
  }

  report(message, whisperTo) {
    const chatCmd = whisperTo ? `/w ${whisperTo.split(/\s/)[0]}` : '/direct';
    this.roll20.sendChat('', `${chatCmd} ${message}`);
  }
};

class ScrollMessage {
  constructor(reporter) {
    this.reporter = reporter;
    this.text = '';
    this.floats = [];
  }

  append(text) {
    this.text = this.text && `${this.text}<br>`;
    this.text += text;
    return this;
  }

  prepend(text) {
    this.text = `${text}${this.text}`;
    return this;
  }


  addFloatingImage(imgSrc, width, height) {
    this.floats.push({
      content: `<img src="${imgSrc}" width="${width}" height="${height}">`,
      width,
      height,
    });

    return this;
  }

  addFloatingSection(innerHtml, width, height) {
    this.floats.push({
      content: innerHtml,
      width,
      height,
    });
    return this;
  }

  buildFloats() {
    let width = 0;
    let height = 0;
    const floatContent = this.floats.map(float => {
      let styleAttr = 'margin-left:auto; margin-right:auto;margin-top:5px;';
      if (float.height) {
        styleAttr += `height: ${float.height}px;`;
        height += float.height;
      }
      if (float.width) {
        styleAttr += `width: ${float.width}px;`;
        width = Math.max(width, float.width);
      }
      return `<div style="${styleAttr}">${float.content}</div>`;
    }).join('');

    return `<div style="float:right;position:relative;width:${width}px;height:${height}px;padding:4px;">` +
      `${floatContent}</div>`;
  }

  buildText() {
    const scrollFrame = '<div style="width: 91%;min-height: 100px;' +
      'background-image: url(http://imgsrv.roll20.net/?src=jesseproductions.com/images/scroll.png);' +
      'background-size: 120% 100%; background-repeat: no-repeat; background-position: 28% 0; line-height:1.2;' +
      'padding: 16% 11%;left: -11%;position: relative;font-family: fantasy;font-size: 130%;font-weight: bold;' +
      'font-style: oblique;color: black;">';

    return `${scrollFrame}${this.buildFloats()}${this.text}</div>`;
  }

  send(whisperTo) {
    this.reporter.report(this.buildText(), whisperTo);
  }
}
