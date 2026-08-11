import { E as EventEmitter, d as deprecation, v as v8_0_0, T as Texture, f as fontStringFromTextStyle, c as TextureStyle, C as CanvasTextMetrics, R as Rectangle, e as CanvasPool, I as ImageSource, g as getCanvasFillStyle, h as Color, i as TextStyle, j as collapseSpaces, k as collapseNewlines, l as isBreakingSpace, m as isCollapsibleSpace, n as isBreakAfterChar, o as lru, p as Cache, w as warn, q as groupD8 } from './index-V104FantasyRTS.js?build=7';

class AbstractBitmapFont extends EventEmitter {
  constructor() {
    super(...arguments);
    /** The map of characters by character string. */
    this.chars = /* @__PURE__ */ Object.create(null);
    /**
     * The line-height of the font face in pixels.
     * @type {number}
     */
    this.lineHeight = 0;
    /**
     * The name of the font face
     * @type {string}
     */
    this.fontFamily = "";
    /** The metrics of the font face. */
    this.fontMetrics = { fontSize: 0, ascent: 0, descent: 0 };
    /**
     * The offset of the font face from the baseline.
     * @type {number}
     */
    this.baseLineOffset = 0;
    /** The range and type of the distance field for this font. */
    this.distanceField = { type: "none", range: 0 };
    /** The map of base page textures (i.e., sheets of glyphs). */
    this.pages = [];
    /** should the fill for this font be applied as a tint to the text. */
    this.applyFillAsTint = true;
    /** The size of the font face in pixels. */
    this.baseMeasurementFontSize = 100;
    this.baseRenderedFontSize = 100;
  }
  /**
   * The name of the font face.
   * @deprecated since 8.0.0 Use `fontFamily` instead.
   */
  get font() {
    deprecation(v8_0_0, "BitmapFont.font is deprecated, please use BitmapFont.fontFamily instead.");
    return this.fontFamily;
  }
  /**
   * The map of base page textures (i.e., sheets of glyphs).
   * @deprecated since 8.0.0 Use `pages` instead.
   */
  get pageTextures() {
    deprecation(v8_0_0, "BitmapFont.pageTextures is deprecated, please use BitmapFont.pages instead.");
    return this.pages;
  }
  /**
   * The size of the font face in pixels.
   * @deprecated since 8.0.0 Use `fontMetrics.fontSize` instead.
   */
  get size() {
    deprecation(v8_0_0, "BitmapFont.size is deprecated, please use BitmapFont.fontMetrics.fontSize instead.");
    return this.fontMetrics.fontSize;
  }
  /**
   * The kind of distance field for this font or "none".
   * @deprecated since 8.0.0 Use `distanceField.type` instead.
   */
  get distanceFieldRange() {
    deprecation(v8_0_0, "BitmapFont.distanceFieldRange is deprecated, please use BitmapFont.distanceField.range instead.");
    return this.distanceField.range;
  }
  /**
   * The range of the distance field in pixels.
   * @deprecated since 8.0.0 Use `distanceField.range` instead.
   */
  get distanceFieldType() {
    deprecation(v8_0_0, "BitmapFont.distanceFieldType is deprecated, please use BitmapFont.distanceField.type instead.");
    return this.distanceField.type;
  }
  destroy(destroyTextures = false) {
    this.emit("destroy", this);
    this.removeAllListeners();
    for (const i in this.chars) {
      this.chars[i].texture?.destroy();
    }
    this.chars = null;
    if (destroyTextures) {
      this.pages.forEach((page) => page.texture.destroy(true));
      this.pages = null;
    }
  }
}

const _DynamicBitmapFont = class _DynamicBitmapFont extends AbstractBitmapFont {
  /**
   * @param options - The options for the dynamic bitmap font.
   */
  constructor(options) {
    super();
    /**
     * this is a resolution modifier for the font size..
     * texture resolution will also be used to scale texture according to its font size also
     */
    this.resolution = 1;
    /** The pages of the font. */
    this.pages = [];
    this._padding = 0;
    this._measureCache = /* @__PURE__ */ Object.create(null);
    this._currentChars = [];
    this._currentX = 0;
    this._currentY = 0;
    this._currentMaxCharHeight = 0;
    this._currentPageIndex = -1;
    this._skipKerning = false;
    const dynamicOptions = { ..._DynamicBitmapFont.defaultOptions, ...options };
    this._textureSize = dynamicOptions.textureSize;
    this._mipmap = dynamicOptions.mipmap;
    const style = dynamicOptions.style.clone();
    if (dynamicOptions.overrideFill) {
      style._fill.color = 16777215;
      style._fill.alpha = 1;
      style._fill.texture = Texture.WHITE;
      style._fill.fill = null;
    }
    this.applyFillAsTint = dynamicOptions.overrideFill;
    const requestedFontSize = style.fontSize;
    style.fontSize = this.baseMeasurementFontSize;
    const font = fontStringFromTextStyle(style);
    if (dynamicOptions.overrideSize) {
      if (style._stroke) {
        style._stroke.width *= this.baseRenderedFontSize / requestedFontSize;
      }
      if (style.dropShadow) {
        style.dropShadow.blur *= this.baseRenderedFontSize / requestedFontSize;
        style.dropShadow.distance *= this.baseRenderedFontSize / requestedFontSize;
      }
    } else {
      style.fontSize = this.baseRenderedFontSize = requestedFontSize;
    }
    this._style = style;
    this._skipKerning = dynamicOptions.skipKerning ?? false;
    this.resolution = dynamicOptions.resolution ?? 1;
    this._padding = dynamicOptions.padding ?? 4;
    if (dynamicOptions.textureStyle) {
      this._textureStyle = dynamicOptions.textureStyle instanceof TextureStyle ? dynamicOptions.textureStyle : new TextureStyle(dynamicOptions.textureStyle);
    }
    this.fontMetrics = CanvasTextMetrics.measureFont(font);
    this.lineHeight = style.lineHeight || this.fontMetrics.fontSize || style.fontSize;
  }
  ensureCharacters(chars) {
    const charList = CanvasTextMetrics.graphemeSegmenter(chars).filter((char) => !this._currentChars.includes(char)).filter((char, index, self) => self.indexOf(char) === index);
    if (!charList.length) return;
    this._currentChars = [...this._currentChars, ...charList];
    let pageData;
    if (this._currentPageIndex === -1) {
      pageData = this._nextPage();
    } else {
      pageData = this.pages[this._currentPageIndex];
    }
    let { canvas, context } = pageData.canvasAndContext;
    let textureSource = pageData.texture.source;
    const style = this._style;
    let currentX = this._currentX;
    let currentY = this._currentY;
    let currentMaxCharHeight = this._currentMaxCharHeight;
    const fontScale = this.baseRenderedFontSize / this.baseMeasurementFontSize;
    const extraPadding = (style.dropShadow?.distance ?? 0) + (style._stroke?.width ?? 0);
    const padding = this._padding + extraPadding;
    let skipTexture = false;
    const maxTextureWidth = canvas.width / this.resolution;
    const maxTextureHeight = canvas.height / this.resolution;
    for (let i = 0; i < charList.length; i++) {
      const char = charList[i];
      const metrics = CanvasTextMetrics.measureText(char, style, canvas, false);
      metrics.lineHeight = metrics.height;
      const width = metrics.width * fontScale;
      const textureGlyphWidth = Math.ceil((style.fontStyle === "italic" ? 2 : 1) * width);
      const height = metrics.height * fontScale;
      const paddedWidth = textureGlyphWidth + padding * 2;
      const paddedHeight = height + padding * 2;
      skipTexture = false;
      if (char !== "\n" && char !== "\r" && char !== "	" && char !== " ") {
        skipTexture = true;
        currentMaxCharHeight = Math.ceil(Math.max(paddedHeight, currentMaxCharHeight));
      }
      if (currentX + paddedWidth > maxTextureWidth) {
        currentY += currentMaxCharHeight;
        currentMaxCharHeight = paddedHeight;
        currentX = 0;
        if (currentY + currentMaxCharHeight > maxTextureHeight) {
          textureSource.update();
          const pageData2 = this._nextPage();
          canvas = pageData2.canvasAndContext.canvas;
          context = pageData2.canvasAndContext.context;
          textureSource = pageData2.texture.source;
          currentX = 0;
          currentY = 0;
          currentMaxCharHeight = 0;
        }
      }
      const xAdvance = context.measureText(char).width / fontScale;
      this.chars[char] = {
        id: char.codePointAt(0),
        xOffset: -(padding / fontScale),
        yOffset: -(padding / fontScale),
        xAdvance,
        kerning: {}
      };
      if (skipTexture) {
        this._drawGlyph(
          context,
          metrics,
          currentX + padding,
          currentY + padding,
          fontScale,
          style
        );
        const px = textureSource.width * fontScale;
        const py = textureSource.height * fontScale;
        const frame = new Rectangle(
          currentX / px * textureSource.width,
          currentY / py * textureSource.height,
          paddedWidth / px * textureSource.width,
          paddedHeight / py * textureSource.height
        );
        this.chars[char].texture = new Texture({
          source: textureSource,
          frame
        });
        currentX += Math.ceil(paddedWidth);
      }
    }
    textureSource.update();
    this._currentX = currentX;
    this._currentY = currentY;
    this._currentMaxCharHeight = currentMaxCharHeight;
    if (!this._skipKerning) this._applyKerning(charList, context, fontScale);
  }
  /**
   * @deprecated since 8.0.0
   * The map of base page textures (i.e., sheets of glyphs).
   */
  get pageTextures() {
    deprecation(v8_0_0, "BitmapFont.pageTextures is deprecated, please use BitmapFont.pages instead.");
    return this.pages;
  }
  _applyKerning(newChars, context, fontScale) {
    const measureCache = this._measureCache;
    for (let i = 0; i < newChars.length; i++) {
      const first = newChars[i];
      for (let j = 0; j < this._currentChars.length; j++) {
        const second = this._currentChars[j];
        let c1 = measureCache[first];
        if (!c1) c1 = measureCache[first] = context.measureText(first).width;
        let c2 = measureCache[second];
        if (!c2) c2 = measureCache[second] = context.measureText(second).width;
        let total = context.measureText(first + second).width;
        let amount = total - (c1 + c2);
        if (amount && this.chars[first]) {
          this.chars[first].kerning[second] = amount / fontScale;
        }
        total = context.measureText(first + second).width;
        amount = total - (c1 + c2);
        if (amount && this.chars[second]) {
          this.chars[second].kerning[first] = amount / fontScale;
        }
      }
    }
  }
  _nextPage() {
    this._currentPageIndex++;
    const textureResolution = this.resolution;
    const canvasAndContext = CanvasPool.getOptimalCanvasAndContext(
      this._textureSize,
      this._textureSize,
      textureResolution
    );
    this._setupContext(canvasAndContext.context, this._style, textureResolution);
    const resolution = textureResolution * (this.baseRenderedFontSize / this.baseMeasurementFontSize);
    const texture = new Texture({
      source: new ImageSource({
        resource: canvasAndContext.canvas,
        resolution,
        alphaMode: "premultiply-alpha-on-upload",
        autoGenerateMipmaps: this._mipmap
      })
    });
    if (this._textureStyle) {
      texture.source.style = this._textureStyle;
    }
    const pageData = {
      canvasAndContext,
      texture
    };
    this.pages[this._currentPageIndex] = pageData;
    return pageData;
  }
  // canvas style!
  _setupContext(context, style, resolution) {
    style.fontSize = this.baseRenderedFontSize;
    context.scale(resolution, resolution);
    context.font = fontStringFromTextStyle(style);
    style.fontSize = this.baseMeasurementFontSize;
    context.textBaseline = style.textBaseline;
    const stroke = style._stroke;
    const strokeThickness = stroke?.width ?? 0;
    if (stroke) {
      context.lineWidth = strokeThickness;
      context.lineJoin = stroke.join;
      context.miterLimit = stroke.miterLimit;
      context.strokeStyle = getCanvasFillStyle(stroke, context);
    }
    if (style._fill) {
      context.fillStyle = getCanvasFillStyle(style._fill, context);
    }
    if (style.dropShadow) {
      const shadowOptions = style.dropShadow;
      const rgb = Color.shared.setValue(shadowOptions.color).toArray();
      const dropShadowBlur = shadowOptions.blur * resolution;
      const dropShadowDistance = shadowOptions.distance * resolution;
      context.shadowColor = `rgba(${rgb[0] * 255},${rgb[1] * 255},${rgb[2] * 255},${shadowOptions.alpha})`;
      context.shadowBlur = dropShadowBlur;
      context.shadowOffsetX = Math.cos(shadowOptions.angle) * dropShadowDistance;
      context.shadowOffsetY = Math.sin(shadowOptions.angle) * dropShadowDistance;
    } else {
      context.shadowColor = "black";
      context.shadowBlur = 0;
      context.shadowOffsetX = 0;
      context.shadowOffsetY = 0;
    }
  }
  _drawGlyph(context, metrics, x, y, fontScale, style) {
    const char = metrics.text;
    const fontProperties = metrics.fontProperties;
    const stroke = style._stroke;
    const strokeThickness = (stroke?.width ?? 0) * fontScale;
    const tx = x + strokeThickness / 2;
    const ty = y - strokeThickness / 2;
    const descent = fontProperties.descent * fontScale;
    const lineHeight = metrics.lineHeight * fontScale;
    let removeShadow = false;
    if (style.stroke && strokeThickness) {
      removeShadow = true;
      context.strokeText(char, tx, ty + lineHeight - descent);
    }
    const { shadowBlur, shadowOffsetX, shadowOffsetY } = context;
    if (style._fill) {
      if (removeShadow) {
        context.shadowBlur = 0;
        context.shadowOffsetX = 0;
        context.shadowOffsetY = 0;
      }
      context.fillText(char, tx, ty + lineHeight - descent);
    }
    if (removeShadow) {
      context.shadowBlur = shadowBlur;
      context.shadowOffsetX = shadowOffsetX;
      context.shadowOffsetY = shadowOffsetY;
    }
  }
  destroy() {
    super.destroy();
    for (let i = 0; i < this.pages.length; i++) {
      const { canvasAndContext, texture } = this.pages[i];
      CanvasPool.returnCanvasAndContext(canvasAndContext);
      texture.destroy(true);
    }
    this.pages = null;
  }
};
_DynamicBitmapFont.defaultOptions = {
  textureSize: 512,
  style: new TextStyle(),
  mipmap: true
};
let DynamicBitmapFont = _DynamicBitmapFont;

function getBitmapTextLayout(chars, style, font, trimEnd) {
  const layoutData = {
    width: 0,
    height: 0,
    offsetY: 0,
    scale: style.fontSize / font.baseMeasurementFontSize,
    lines: [{
      width: 0,
      charPositions: [],
      spaceWidth: 0,
      spacesIndex: [],
      chars: []
    }]
  };
  layoutData.offsetY = font.baseLineOffset;
  let currentLine = layoutData.lines[0];
  let previousChar = null;
  let firstWord = true;
  const currentWord = {
    width: 0,
    start: 0,
    index: 0,
    // use index to not modify the array as we use it a lot!
    positions: [],
    chars: []
  };
  const scale = font.baseMeasurementFontSize / style.fontSize;
  const adjustedLetterSpacing = style.letterSpacing * scale;
  const adjustedWordWrapWidth = style.wordWrapWidth * scale;
  const adjustedLineHeight = style.lineHeight ? style.lineHeight * scale : font.lineHeight;
  const breakWords = style.wordWrap && style.breakWords;
  const shouldCollapseSpaces = collapseSpaces(style.whiteSpace);
  const shouldCollapseNewlines = collapseNewlines(style.whiteSpace);
  if (shouldCollapseSpaces || shouldCollapseNewlines) {
    const processed = [];
    let prevWasBreakingSpace = shouldCollapseSpaces;
    for (let c = 0; c < chars.length; c++) {
      let char = chars[c];
      if (char === "\r" || char === "\n") {
        if (shouldCollapseNewlines) {
          if (char === "\r" && chars[c + 1] === "\n") c++;
          char = " ";
        } else {
          if (shouldCollapseSpaces) prevWasBreakingSpace = true;
          processed.push(char);
          continue;
        }
      }
      if (isBreakingSpace(char)) {
        if (shouldCollapseSpaces && isCollapsibleSpace(char)) {
          if (prevWasBreakingSpace) continue;
          prevWasBreakingSpace = true;
          processed.push(" ");
        } else {
          prevWasBreakingSpace = false;
          processed.push(char);
        }
      } else {
        prevWasBreakingSpace = false;
        processed.push(char);
      }
    }
    chars = processed;
  }
  const nextWord = (word) => {
    const start = currentLine.width;
    for (let j = 0; j < currentWord.index; j++) {
      const position = word.positions[j];
      currentLine.chars.push(word.chars[j]);
      currentLine.charPositions.push(position + start);
    }
    currentLine.width += word.width;
    if (currentWord.index > 0 || !shouldCollapseSpaces) {
      firstWord = false;
    }
    currentWord.width = 0;
    currentWord.index = 0;
    currentWord.chars.length = 0;
  };
  const nextLine = () => {
    let index = currentLine.chars.length - 1;
    if (trimEnd) {
      let lastChar = currentLine.chars[index];
      while (isCollapsibleSpace(lastChar)) {
        currentLine.width -= font.chars[lastChar].xAdvance;
        currentLine.spacesIndex.pop();
        lastChar = currentLine.chars[--index];
      }
    }
    layoutData.width = Math.max(layoutData.width, currentLine.width);
    currentLine = {
      width: 0,
      charPositions: [],
      chars: [],
      spaceWidth: 0,
      spacesIndex: []
    };
    firstWord = true;
    layoutData.lines.push(currentLine);
    layoutData.height += adjustedLineHeight;
  };
  const checkIsOverflow = (lineWidth) => lineWidth - adjustedLetterSpacing > adjustedWordWrapWidth;
  for (let i = 0; i < chars.length + 1; i++) {
    let char;
    const isEnd = i === chars.length;
    if (!isEnd) {
      char = chars[i];
    }
    const charData = font.chars[char];
    const isSpace = /(?:\s)/.test(char);
    const isWordBreak = isSpace || char === "\r" || char === "\n" || isEnd;
    if (isWordBreak) {
      const addWordToNextLine = !firstWord && style.wordWrap && checkIsOverflow(currentLine.width + currentWord.width);
      if (addWordToNextLine) {
        nextLine();
        nextWord(currentWord);
        if (!isEnd && charData) {
          currentLine.charPositions.push(0);
        }
      } else {
        currentWord.start = currentLine.width;
        nextWord(currentWord);
        if (!isEnd && charData) {
          currentLine.charPositions.push(0);
        }
      }
      if (char === "\r" || char === "\n") {
        nextLine();
      } else if (!isEnd && charData) {
        const spaceWidth = charData.xAdvance + (charData.kerning?.[previousChar] || 0) + adjustedLetterSpacing;
        currentLine.width += spaceWidth;
        currentLine.spaceWidth = spaceWidth;
        currentLine.spacesIndex.push(currentLine.charPositions.length);
        currentLine.chars.push(char);
      }
    } else if (charData) {
      const kerning = charData.kerning?.[previousChar] || 0;
      const nextCharWidth = charData.xAdvance + kerning + adjustedLetterSpacing;
      const wordExceedsWrapWidth = breakWords && checkIsOverflow(currentWord.width + nextCharWidth);
      if (wordExceedsWrapWidth) {
        if (!firstWord) {
          nextLine();
        }
        nextWord(currentWord);
        nextLine();
      }
      currentWord.positions[currentWord.index++] = currentWord.width + kerning;
      currentWord.chars.push(char);
      currentWord.width += nextCharWidth;
      if (isBreakAfterChar(char)) {
        const addWordToNextLine = !firstWord && style.wordWrap && checkIsOverflow(currentLine.width + currentWord.width);
        if (addWordToNextLine) {
          nextLine();
        }
        nextWord(currentWord);
      }
    }
    previousChar = char;
  }
  nextLine();
  if (style.align === "center") {
    alignCenter(layoutData);
  } else if (style.align === "right") {
    alignRight(layoutData);
  } else if (style.align === "justify") {
    alignJustify(layoutData);
  }
  return layoutData;
}
function alignCenter(measurementData) {
  for (let i = 0; i < measurementData.lines.length; i++) {
    const line = measurementData.lines[i];
    const offset = measurementData.width / 2 - line.width / 2;
    for (let j = 0; j < line.charPositions.length; j++) {
      line.charPositions[j] += offset;
    }
  }
}
function alignRight(measurementData) {
  for (let i = 0; i < measurementData.lines.length; i++) {
    const line = measurementData.lines[i];
    const offset = measurementData.width - line.width;
    for (let j = 0; j < line.charPositions.length; j++) {
      line.charPositions[j] += offset;
    }
  }
}
function alignJustify(measurementData) {
  const width = measurementData.width;
  for (let i = 0; i < measurementData.lines.length - 2; i++) {
    const line = measurementData.lines[i];
    let indy = 0;
    let spaceIndex = line.spacesIndex[indy++];
    let offset = 0;
    const totalSpaces = line.spacesIndex.length;
    const newSpaceWidth = (width - line.width) / totalSpaces;
    const spaceWidth = newSpaceWidth;
    for (let j = 0; j < line.charPositions.length; j++) {
      if (j === spaceIndex) {
        spaceIndex = line.spacesIndex[indy++];
        offset += spaceWidth;
      }
      line.charPositions[j] += offset;
    }
  }
}

function resolveCharacters(chars) {
  if (chars === "") {
    return [];
  }
  if (typeof chars === "string") {
    chars = [chars];
  }
  const result = [];
  for (let i = 0, j = chars.length; i < j; i++) {
    const item = chars[i];
    if (Array.isArray(item)) {
      if (item.length !== 2) {
        throw new Error(`[BitmapFont]: Invalid character range length, expecting 2 got ${item.length}.`);
      }
      if (item[0].length === 0 || item[1].length === 0) {
        throw new Error("[BitmapFont]: Invalid character delimiter.");
      }
      const startCode = item[0].charCodeAt(0);
      const endCode = item[1].charCodeAt(0);
      if (endCode < startCode) {
        throw new Error("[BitmapFont]: Invalid character range.");
      }
      for (let i2 = startCode, j2 = endCode; i2 <= j2; i2++) {
        result.push(String.fromCharCode(i2));
      }
    } else {
      result.push(...Array.from(item));
    }
  }
  if (result.length === 0) {
    throw new Error("[BitmapFont]: Empty set when resolving characters.");
  }
  return result;
}

let fontCount = 0;
class BitmapFontManagerClass {
  constructor() {
    /**
     * This character set includes all the letters in the alphabet (both lower- and upper- case).
     * @type {string[][]}
     * @example
     * BitmapFont.from('ExampleFont', style, { chars: BitmapFont.ALPHA })
     */
    this.ALPHA = [["a", "z"], ["A", "Z"], " "];
    /**
     * This character set includes all decimal digits (from 0 to 9).
     * @type {string[][]}
     * @example
     * BitmapFont.from('ExampleFont', style, { chars: BitmapFont.NUMERIC })
     */
    this.NUMERIC = [["0", "9"]];
    /**
     * This character set is the union of `BitmapFont.ALPHA` and `BitmapFont.NUMERIC`.
     * @type {string[][]}
     */
    this.ALPHANUMERIC = [["a", "z"], ["A", "Z"], ["0", "9"], " "];
    /**
     * This character set consists of all the ASCII table.
     * @type {string[][]}
     * @see http://www.asciitable.com/
     */
    this.ASCII = [[" ", "~"]];
    /** Default options for installing a new BitmapFont. */
    this.defaultOptions = {
      chars: this.ALPHANUMERIC,
      resolution: 1,
      padding: 4,
      skipKerning: false,
      textureStyle: null
    };
    /** Cache for measured text layouts to avoid recalculating them multiple times. */
    this.measureCache = lru(1e3);
  }
  /**
   * Get a font for the specified text and style.
   * @param text - The text to get the font for
   * @param style - The style to use
   */
  getFont(text, style) {
    let fontFamilyKey = `${style.fontFamily}-bitmap`;
    let overrideFill = true;
    if (Cache.has(fontFamilyKey)) {
      const dynamicFont2 = Cache.get(fontFamilyKey);
      dynamicFont2.ensureCharacters?.(text);
      return dynamicFont2;
    }
    if (style._fill.fill && !style._stroke) {
      fontFamilyKey += style._fill.fill.styleKey;
      overrideFill = false;
    } else if (style._stroke || style.dropShadow) {
      fontFamilyKey = `${style.styleKey}-bitmap`;
      overrideFill = false;
    }
    fontFamilyKey += `-${style.fontStyle}`;
    fontFamilyKey += `-${style.fontVariant}`;
    fontFamilyKey += `-${style.fontWeight}`;
    if (!Cache.has(fontFamilyKey)) {
      const styleCopy = Object.create(style);
      styleCopy["_lineHeight"] = 0;
      const fnt = new DynamicBitmapFont({
        style: styleCopy,
        overrideFill,
        overrideSize: true,
        ...this.defaultOptions
      });
      fontCount++;
      if (fontCount > 50) {
        warn("BitmapText", `You have dynamically created ${fontCount} bitmap fonts, this can be inefficient. Try pre installing your font styles using \`BitmapFont.install({name:"style1", style})\``);
      }
      fnt.once("destroy", () => {
        fontCount--;
        Cache.remove(fontFamilyKey);
      });
      Cache.set(
        fontFamilyKey,
        fnt
      );
    }
    const dynamicFont = Cache.get(fontFamilyKey);
    dynamicFont.ensureCharacters?.(text);
    return dynamicFont;
  }
  /**
   * Get the layout of a text for the specified style.
   * @param text - The text to get the layout for
   * @param style - The style to use
   * @param trimEnd - Whether to ignore whitespaces at the end of each line
   */
  getLayout(text, style, trimEnd = true) {
    const bitmapFont = this.getFont(text, style);
    const id = `${text}-${style.styleKey}-${trimEnd}`;
    if (this.measureCache.has(id)) {
      return this.measureCache.get(id);
    }
    const segments = CanvasTextMetrics.graphemeSegmenter(text);
    const layoutData = getBitmapTextLayout(segments, style, bitmapFont, trimEnd);
    this.measureCache.set(id, layoutData);
    return layoutData;
  }
  /**
   * Measure the text using the specified style.
   * @param text - The text to measure
   * @param style - The style to use
   * @param trimEnd - Whether to ignore whitespaces at the end of each line
   */
  measureText(text, style, trimEnd = true) {
    return this.getLayout(text, style, trimEnd);
  }
  // eslint-disable-next-line max-len
  install(...args) {
    let options = args[0];
    if (typeof options === "string") {
      options = {
        name: options,
        style: args[1],
        chars: args[2]?.chars,
        resolution: args[2]?.resolution,
        padding: args[2]?.padding,
        skipKerning: args[2]?.skipKerning
      };
      deprecation(v8_0_0, "BitmapFontManager.install(name, style, options) is deprecated, use BitmapFontManager.install({name, style, ...options})");
    }
    const name = options?.name;
    if (!name) {
      throw new Error("[BitmapFontManager] Property `name` is required.");
    }
    options = { ...this.defaultOptions, ...options };
    const textStyle = options.style;
    const style = textStyle instanceof TextStyle ? textStyle : new TextStyle(textStyle);
    const overrideFill = options.dynamicFill ?? this._canUseTintForStyle(style);
    const font = new DynamicBitmapFont({
      style,
      overrideFill,
      skipKerning: options.skipKerning,
      padding: options.padding,
      resolution: options.resolution,
      overrideSize: false,
      textureStyle: options.textureStyle
    });
    const flatChars = resolveCharacters(options.chars);
    font.ensureCharacters(flatChars.join(""));
    Cache.set(`${name}-bitmap`, font);
    font.once("destroy", () => Cache.remove(`${name}-bitmap`));
    return font;
  }
  /**
   * Uninstalls a bitmap font from the cache.
   * @param {string} name - The name of the bitmap font to uninstall.
   */
  uninstall(name) {
    const cacheKey = `${name}-bitmap`;
    const font = Cache.get(cacheKey);
    if (font) {
      font.destroy();
    }
  }
  /**
   * Determines if a style can use tinting instead of baking colors into the bitmap.
   * Tinting is more efficient as it allows reusing the same bitmap with different colors.
   * @param style - The text style to evaluate
   * @returns true if the style can use tinting, false if colors must be baked in
   * @private
   */
  _canUseTintForStyle(style) {
    return !style._stroke && (!style.dropShadow || style.dropShadow.color === 0) && !style._fill.fill && style._fill.color === 16777215;
  }
}
const BitmapFontManager = new BitmapFontManagerClass();

class BitmapFont extends AbstractBitmapFont {
  constructor(options, url) {
    super();
    const { textures, data } = options;
    Object.keys(data.pages).forEach((key) => {
      const pageData = data.pages[parseInt(key, 10)];
      const texture = textures[pageData.id];
      this.pages.push({ texture });
    });
    Object.keys(data.chars).forEach((key) => {
      const charData = data.chars[key];
      const {
        frame: textureFrame,
        source: textureSource,
        rotate: textureRotate
      } = textures[charData.page];
      const frame = groupD8.transformRectCoords(
        charData,
        textureFrame,
        textureRotate,
        new Rectangle()
      );
      const texture = new Texture({
        frame,
        orig: new Rectangle(0, 0, charData.width, charData.height),
        source: textureSource,
        rotate: textureRotate
      });
      this.chars[key] = {
        id: key.codePointAt(0),
        xOffset: charData.xOffset,
        yOffset: charData.yOffset,
        xAdvance: charData.xAdvance,
        kerning: charData.kerning ?? {},
        texture
      };
    });
    this.baseRenderedFontSize = data.fontSize;
    this.baseMeasurementFontSize = data.fontSize;
    this.fontMetrics = {
      ascent: 0,
      descent: 0,
      fontSize: data.fontSize
    };
    this.baseLineOffset = data.baseLineOffset;
    this.lineHeight = data.lineHeight;
    this.fontFamily = data.fontFamily;
    this.distanceField = data.distanceField ?? {
      type: "none",
      range: 0
    };
    this.url = url;
  }
  /** Destroys the BitmapFont object. */
  destroy() {
    super.destroy();
    for (let i = 0; i < this.pages.length; i++) {
      const { texture } = this.pages[i];
      texture.destroy(true);
    }
    this.pages = null;
  }
  /**
   * Generates and installs a bitmap font with the specified options.
   * The font will be cached and available for use in BitmapText objects.
   * @param options - Setup options for font generation
   * @returns Installed font instance
   * @example
   * ```ts
   * // Install a basic font
   * BitmapFont.install({
   *     name: 'Title',
   *     style: {
   *         fontFamily: 'Arial',
   *         fontSize: 32,
   *         fill: '#ffffff'
   *     }
   * });
   *
   * // Install with advanced options
   * BitmapFont.install({
   *     name: 'Custom',
   *     style: {
   *         fontFamily: 'Arial',
   *         fontSize: 24,
   *         fill: '#00ff00',
   *         stroke: { color: '#000000', width: 2 }
   *     },
   *     chars: [['a', 'z'], ['A', 'Z'], ['0', '9']],
   *     resolution: 2,
   *     padding: 4,
   *     textureStyle: {
   *         scaleMode: 'nearest'
   *     }
   * });
   * ```
   */
  static install(options) {
    BitmapFontManager.install(options);
  }
  /**
   * Uninstalls a bitmap font from the cache.
   * This frees up memory and resources associated with the font.
   * @param name - The name of the bitmap font to uninstall
   * @example
   * ```ts
   * // Remove a font when it's no longer needed
   * BitmapFont.uninstall('MyCustomFont');
   *
   * // Clear multiple fonts
   * ['Title', 'Heading', 'Body'].forEach(BitmapFont.uninstall);
   * ```
   */
  static uninstall(name) {
    BitmapFontManager.uninstall(name);
  }
}

export { BitmapFont };
