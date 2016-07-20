'use strict';

const handoutFrame = `
<div style="margin-left:auto; margin-right:auto; width:480px; position:relative">
<div style="padding-bottom:130%">
<div class="scrollyBg" style="position:absolute; top:0; left:0; right:0; bottom:0;
line-height:1.2;font-family: fantasy;font-size: 130%;font-weight: bold;font-style: oblique;color: black;
padding:85px 25px 93px 25px;"> <!--CONTENT-->
</div>
</div>
</div>`;


const elementRenderers = {
  h1(content) {
    return `<br><h6 style="margin:0;font-size:22px;text-transform:none;">${content}</h6>`;
  },
  h2(content) {
    return `<br><h6 style=margin:0;font-size:20px;text-transform:none;">${content}</h6>`;
  },
  h3(content) {
    return `<br><h6 style="margin:0;font-size:18px;text-transform:none;">${content}</h6>`;
  },
  h4(content) {
    return `<br><h6 style="margin:0;font-size:16px;text-transform:none;">${content}</h6>`;
  },
  p(content) {
    return `<h6 style="margin: 0; font-size:14px;text-transform:none;">${content}</h6>`;
  },
};

// noinspection JSUnusedLocalSymbols
module.exports = class Reporter {
  constructor(roll20, logger) {
    this.roll20 = roll20;
    this.logger = logger;
    logger.wrapModule(this);
  }

  makeScrollMessage() {
    return new ScrollMessage(this);
  }

  report(message, whisperTo) {
    const chatCmd = whisperTo ? `/w ${whisperTo.split(/\s/)[0]}` : '/direct';
    this.roll20.sendChat('', `${chatCmd} ${message}`);
  }

  makeHandoutScrollWriter() {
    return new ScrollHandout(this.logger);
  }

  get logWrap() {
    return 'Reporter';
  }
};

class ScrollHandout {
  constructor(logger) {
    this._elements = [];
    this._logger = logger;
  }

  heading(text, level) {
    this._elements.push({ tag: `h${level}`, text });
  }

  paragraph(text) {
    this._elements.push({ tag: 'p', text });
  }

  renderTo(handout) {
    const messageText = this._elements
      .map(e => elementRenderers[e.tag](e.text)).join('\n');
    const text = handoutFrame.replace('<!--CONTENT-->', messageText);
    this._logger.debug('Rendered handout text: $$$', text);
    handout.set('notes', text);
  }

  get logWrap() {
    return 'ScrollHandout';
  }
}

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
      'background-image: ' +
      'url(https://s3.amazonaws.com/files.d20.io/images/21093605/ckajybJykpZpyzPK_rcmFw/thumb.png?1468962895);' +
      'background-size: 120% 100%; background-repeat: no-repeat; background-position: 28% 0; line-height:1.2;' +
      'padding: 16% 11%;left: -11%;position: relative;font-family: fantasy;font-size: 130%;font-weight: bold;' +
      'font-style: oblique;color: black;">';

    return `${scrollFrame}${this.buildFloats()}${this.text}</div>`;
  }

  send(whisperTo) {
    this.reporter.report(this.buildText(), whisperTo);
  }

  get logWrap() {
    return 'ScrollMessage';
  }
}
