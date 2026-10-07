/**
 * Browser half: the RemoteDesk control panel inside DSH Web settings.
 *
 * Hand-written against the frozen platform module table (react,
 * react/jsx-runtime), so this package needs no bundler step. Every request goes
 * to an exact `/api/remotedesk.*` route owned by this package's host half, which
 * the Connection plugin authenticates with the same Host/Origin fence and signed
 * browser-session cookie as the built-in GUI.
 */
window.__ModuleLoader__.load({
  id: "@remotedesk/dsh-plugin",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");

    const qrCodeGenerator = (() => {
//---------------------------------------------------------------------
//
// QR Code Generator for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//  http://www.opensource.org/licenses/mit-license.php
//
// The word 'QR Code' is registered trademark of
// DENSO WAVE INCORPORATED
//  http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------

var qrcode = function() {

  //---------------------------------------------------------------------
  // qrcode
  //---------------------------------------------------------------------

  /**
   * qrcode
   * @param typeNumber 1 to 40
   * @param errorCorrectionLevel 'L','M','Q','H'
   */
  var qrcode = function(typeNumber, errorCorrectionLevel) {

    var PAD0 = 0xEC;
    var PAD1 = 0x11;

    var _typeNumber = typeNumber;
    var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
    var _modules = null;
    var _moduleCount = 0;
    var _dataCache = null;
    var _dataList = [];

    var _this = {};

    var makeImpl = function(test, maskPattern) {

      _moduleCount = _typeNumber * 4 + 17;
      _modules = function(moduleCount) {
        var modules = new Array(moduleCount);
        for (var row = 0; row < moduleCount; row += 1) {
          modules[row] = new Array(moduleCount);
          for (var col = 0; col < moduleCount; col += 1) {
            modules[row][col] = null;
          }
        }
        return modules;
      }(_moduleCount);

      setupPositionProbePattern(0, 0);
      setupPositionProbePattern(_moduleCount - 7, 0);
      setupPositionProbePattern(0, _moduleCount - 7);
      setupPositionAdjustPattern();
      setupTimingPattern();
      setupTypeInfo(test, maskPattern);

      if (_typeNumber >= 7) {
        setupTypeNumber(test);
      }

      if (_dataCache == null) {
        _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
      }

      mapData(_dataCache, maskPattern);
    };

    var setupPositionProbePattern = function(row, col) {

      for (var r = -1; r <= 7; r += 1) {

        if (row + r <= -1 || _moduleCount <= row + r) continue;

        for (var c = -1; c <= 7; c += 1) {

          if (col + c <= -1 || _moduleCount <= col + c) continue;

          if ( (0 <= r && r <= 6 && (c == 0 || c == 6) )
              || (0 <= c && c <= 6 && (r == 0 || r == 6) )
              || (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
            _modules[row + r][col + c] = true;
          } else {
            _modules[row + r][col + c] = false;
          }
        }
      }
    };

    var getBestMaskPattern = function() {

      var minLostPoint = 0;
      var pattern = 0;

      for (var i = 0; i < 8; i += 1) {

        makeImpl(true, i);

        var lostPoint = QRUtil.getLostPoint(_this);

        if (i == 0 || minLostPoint > lostPoint) {
          minLostPoint = lostPoint;
          pattern = i;
        }
      }

      return pattern;
    };

    var setupTimingPattern = function() {

      for (var r = 8; r < _moduleCount - 8; r += 1) {
        if (_modules[r][6] != null) {
          continue;
        }
        _modules[r][6] = (r % 2 == 0);
      }

      for (var c = 8; c < _moduleCount - 8; c += 1) {
        if (_modules[6][c] != null) {
          continue;
        }
        _modules[6][c] = (c % 2 == 0);
      }
    };

    var setupPositionAdjustPattern = function() {

      var pos = QRUtil.getPatternPosition(_typeNumber);

      for (var i = 0; i < pos.length; i += 1) {

        for (var j = 0; j < pos.length; j += 1) {

          var row = pos[i];
          var col = pos[j];

          if (_modules[row][col] != null) {
            continue;
          }

          for (var r = -2; r <= 2; r += 1) {

            for (var c = -2; c <= 2; c += 1) {

              if (r == -2 || r == 2 || c == -2 || c == 2
                  || (r == 0 && c == 0) ) {
                _modules[row + r][col + c] = true;
              } else {
                _modules[row + r][col + c] = false;
              }
            }
          }
        }
      }
    };

    var setupTypeNumber = function(test) {

      var bits = QRUtil.getBCHTypeNumber(_typeNumber);

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
      }

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
      }
    };

    var setupTypeInfo = function(test, maskPattern) {

      var data = (_errorCorrectionLevel << 3) | maskPattern;
      var bits = QRUtil.getBCHTypeInfo(data);

      // vertical
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 6) {
          _modules[i][8] = mod;
        } else if (i < 8) {
          _modules[i + 1][8] = mod;
        } else {
          _modules[_moduleCount - 15 + i][8] = mod;
        }
      }

      // horizontal
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 8) {
          _modules[8][_moduleCount - i - 1] = mod;
        } else if (i < 9) {
          _modules[8][15 - i - 1 + 1] = mod;
        } else {
          _modules[8][15 - i - 1] = mod;
        }
      }

      // fixed module
      _modules[_moduleCount - 8][8] = (!test);
    };

    var mapData = function(data, maskPattern) {

      var inc = -1;
      var row = _moduleCount - 1;
      var bitIndex = 7;
      var byteIndex = 0;
      var maskFunc = QRUtil.getMaskFunction(maskPattern);

      for (var col = _moduleCount - 1; col > 0; col -= 2) {

        if (col == 6) col -= 1;

        while (true) {

          for (var c = 0; c < 2; c += 1) {

            if (_modules[row][col - c] == null) {

              var dark = false;

              if (byteIndex < data.length) {
                dark = ( ( (data[byteIndex] >>> bitIndex) & 1) == 1);
              }

              var mask = maskFunc(row, col - c);

              if (mask) {
                dark = !dark;
              }

              _modules[row][col - c] = dark;
              bitIndex -= 1;

              if (bitIndex == -1) {
                byteIndex += 1;
                bitIndex = 7;
              }
            }
          }

          row += inc;

          if (row < 0 || _moduleCount <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    };

    var createBytes = function(buffer, rsBlocks) {

      var offset = 0;

      var maxDcCount = 0;
      var maxEcCount = 0;

      var dcdata = new Array(rsBlocks.length);
      var ecdata = new Array(rsBlocks.length);

      for (var r = 0; r < rsBlocks.length; r += 1) {

        var dcCount = rsBlocks[r].dataCount;
        var ecCount = rsBlocks[r].totalCount - dcCount;

        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);

        dcdata[r] = new Array(dcCount);

        for (var i = 0; i < dcdata[r].length; i += 1) {
          dcdata[r][i] = 0xff & buffer.getBuffer()[i + offset];
        }
        offset += dcCount;

        var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
        var rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);

        var modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (var i = 0; i < ecdata[r].length; i += 1) {
          var modIndex = i + modPoly.getLength() - ecdata[r].length;
          ecdata[r][i] = (modIndex >= 0)? modPoly.getAt(modIndex) : 0;
        }
      }

      var totalCodeCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalCodeCount += rsBlocks[i].totalCount;
      }

      var data = new Array(totalCodeCount);
      var index = 0;

      for (var i = 0; i < maxDcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < dcdata[r].length) {
            data[index] = dcdata[r][i];
            index += 1;
          }
        }
      }

      for (var i = 0; i < maxEcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < ecdata[r].length) {
            data[index] = ecdata[r][i];
            index += 1;
          }
        }
      }

      return data;
    };

    var createData = function(typeNumber, errorCorrectionLevel, dataList) {

      var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel);

      var buffer = qrBitBuffer();

      for (var i = 0; i < dataList.length; i += 1) {
        var data = dataList[i];
        buffer.put(data.getMode(), 4);
        buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
        data.write(buffer);
      }

      // calc num max data.
      var totalDataCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalDataCount += rsBlocks[i].dataCount;
      }

      if (buffer.getLengthInBits() > totalDataCount * 8) {
        throw 'code length overflow. ('
          + buffer.getLengthInBits()
          + '>'
          + totalDataCount * 8
          + ')';
      }

      // end code
      if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
        buffer.put(0, 4);
      }

      // padding
      while (buffer.getLengthInBits() % 8 != 0) {
        buffer.putBit(false);
      }

      // padding
      while (true) {

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD0, 8);

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD1, 8);
      }

      return createBytes(buffer, rsBlocks);
    };

    _this.addData = function(data, mode) {

      mode = mode || 'Byte';

      var newData = null;

      switch(mode) {
      case 'Numeric' :
        newData = qrNumber(data);
        break;
      case 'Alphanumeric' :
        newData = qrAlphaNum(data);
        break;
      case 'Byte' :
        newData = qr8BitByte(data);
        break;
      case 'Kanji' :
        newData = qrKanji(data);
        break;
      default :
        throw 'mode:' + mode;
      }

      _dataList.push(newData);
      _dataCache = null;
    };

    _this.isDark = function(row, col) {
      if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
        throw row + ',' + col;
      }
      return _modules[row][col];
    };

    _this.getModuleCount = function() {
      return _moduleCount;
    };

    _this.make = function() {
      if (_typeNumber < 1) {
        var typeNumber = 1;

        for (; typeNumber < 40; typeNumber++) {
          var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, _errorCorrectionLevel);
          var buffer = qrBitBuffer();

          for (var i = 0; i < _dataList.length; i++) {
            var data = _dataList[i];
            buffer.put(data.getMode(), 4);
            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
            data.write(buffer);
          }

          var totalDataCount = 0;
          for (var i = 0; i < rsBlocks.length; i++) {
            totalDataCount += rsBlocks[i].dataCount;
          }

          if (buffer.getLengthInBits() <= totalDataCount * 8) {
            break;
          }
        }

        _typeNumber = typeNumber;
      }

      makeImpl(false, getBestMaskPattern() );
    };

    _this.createTableTag = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var qrHtml = '';

      qrHtml += '<table style="';
      qrHtml += ' border-width: 0px; border-style: none;';
      qrHtml += ' border-collapse: collapse;';
      qrHtml += ' padding: 0px; margin: ' + margin + 'px;';
      qrHtml += '">';
      qrHtml += '<tbody>';

      for (var r = 0; r < _this.getModuleCount(); r += 1) {

        qrHtml += '<tr>';

        for (var c = 0; c < _this.getModuleCount(); c += 1) {
          qrHtml += '<td style="';
          qrHtml += ' border-width: 0px; border-style: none;';
          qrHtml += ' border-collapse: collapse;';
          qrHtml += ' padding: 0px; margin: 0px;';
          qrHtml += ' width: ' + cellSize + 'px;';
          qrHtml += ' height: ' + cellSize + 'px;';
          qrHtml += ' background-color: ';
          qrHtml += _this.isDark(r, c)? '#000000' : '#ffffff';
          qrHtml += ';';
          qrHtml += '"/>';
        }

        qrHtml += '</tr>';
      }

      qrHtml += '</tbody>';
      qrHtml += '</table>';

      return qrHtml;
    };

    _this.createSvgTag = function(cellSize, margin, alt, title) {

      var opts = {};
      if (typeof arguments[0] == 'object') {
        // Called by options.
        opts = arguments[0];
        // overwrite cellSize and margin.
        cellSize = opts.cellSize;
        margin = opts.margin;
        alt = opts.alt;
        title = opts.title;
      }

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      // Compose alt property surrogate
      alt = (typeof alt === 'string') ? {text: alt} : alt || {};
      alt.text = alt.text || null;
      alt.id = (alt.text) ? alt.id || 'qrcode-description' : null;

      // Compose title property surrogate
      title = (typeof title === 'string') ? {text: title} : title || {};
      title.text = title.text || null;
      title.id = (title.text) ? title.id || 'qrcode-title' : null;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var c, mc, r, mr, qrSvg='', rect;

      rect = 'l' + cellSize + ',0 0,' + cellSize +
        ' -' + cellSize + ',0 0,-' + cellSize + 'z ';

      qrSvg += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"';
      qrSvg += !opts.scalable ? ' width="' + size + 'px" height="' + size + 'px"' : '';
      qrSvg += ' viewBox="0 0 ' + size + ' ' + size + '" ';
      qrSvg += ' preserveAspectRatio="xMinYMin meet"';
      qrSvg += (title.text || alt.text) ? ' role="img" aria-labelledby="' +
          escapeXml([title.id, alt.id].join(' ').trim() ) + '"' : '';
      qrSvg += '>';
      qrSvg += (title.text) ? '<title id="' + escapeXml(title.id) + '">' +
          escapeXml(title.text) + '</title>' : '';
      qrSvg += (alt.text) ? '<description id="' + escapeXml(alt.id) + '">' +
          escapeXml(alt.text) + '</description>' : '';
      qrSvg += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>';
      qrSvg += '<path d="';

      for (r = 0; r < _this.getModuleCount(); r += 1) {
        mr = r * cellSize + margin;
        for (c = 0; c < _this.getModuleCount(); c += 1) {
          if (_this.isDark(r, c) ) {
            mc = c*cellSize+margin;
            qrSvg += 'M' + mc + ',' + mr + rect;
          }
        }
      }

      qrSvg += '" stroke="transparent" fill="black"/>';
      qrSvg += '</svg>';

      return qrSvg;
    };

    _this.createDataURL = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      return createDataURL(size, size, function(x, y) {
        if (min <= x && x < max && min <= y && y < max) {
          var c = Math.floor( (x - min) / cellSize);
          var r = Math.floor( (y - min) / cellSize);
          return _this.isDark(r, c)? 0 : 1;
        } else {
          return 1;
        }
      } );
    };

    _this.createImgTag = function(cellSize, margin, alt) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;

      var img = '';
      img += '<img';
      img += '\u0020src="';
      img += _this.createDataURL(cellSize, margin);
      img += '"';
      img += '\u0020width="';
      img += size;
      img += '"';
      img += '\u0020height="';
      img += size;
      img += '"';
      if (alt) {
        img += '\u0020alt="';
        img += escapeXml(alt);
        img += '"';
      }
      img += '/>';

      return img;
    };

    var escapeXml = function(s) {
      var escaped = '';
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charAt(i);
        switch(c) {
        case '<': escaped += '&lt;'; break;
        case '>': escaped += '&gt;'; break;
        case '&': escaped += '&amp;'; break;
        case '"': escaped += '&quot;'; break;
        default : escaped += c; break;
        }
      }
      return escaped;
    };

    var _createHalfASCII = function(margin) {
      var cellSize = 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r1, r2, p;

      var blocks = {
        '██': '█',
        '█ ': '▀',
        ' █': '▄',
        '  ': ' '
      };

      var blocksLastLineNoMargin = {
        '██': '▀',
        '█ ': '▀',
        ' █': ' ',
        '  ': ' '
      };

      var ascii = '';
      for (y = 0; y < size; y += 2) {
        r1 = Math.floor((y - min) / cellSize);
        r2 = Math.floor((y + 1 - min) / cellSize);
        for (x = 0; x < size; x += 1) {
          p = '█';

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {
            p = ' ';
          }

          if (min <= x && x < max && min <= y+1 && y+1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {
            p += ' ';
          }
          else {
            p += '█';
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          ascii += (margin < 1 && y+1 >= max) ? blocksLastLineNoMargin[p] : blocks[p];
        }

        ascii += '\n';
      }

      if (size % 2 && margin > 0) {
        return ascii.substring(0, ascii.length - size - 1) + Array(size+1).join('▀');
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.createASCII = function(cellSize, margin) {
      cellSize = cellSize || 1;

      if (cellSize < 2) {
        return _createHalfASCII(margin);
      }

      cellSize -= 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r, p;

      var white = Array(cellSize+1).join('██');
      var black = Array(cellSize+1).join('  ');

      var ascii = '';
      var line = '';
      for (y = 0; y < size; y += 1) {
        r = Math.floor( (y - min) / cellSize);
        line = '';
        for (x = 0; x < size; x += 1) {
          p = 1;

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {
            p = 0;
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          line += p ? white : black;
        }

        for (r = 0; r < cellSize; r += 1) {
          ascii += line + '\n';
        }
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.renderTo2dContext = function(context, cellSize) {
      cellSize = cellSize || 2;
      var length = _this.getModuleCount();
      for (var row = 0; row < length; row++) {
        for (var col = 0; col < length; col++) {
          context.fillStyle = _this.isDark(row, col) ? 'black' : 'white';
          context.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
        }
      }
    }

    return _this;
  };

  //---------------------------------------------------------------------
  // qrcode.stringToBytes
  //---------------------------------------------------------------------

  qrcode.stringToBytesFuncs = {
    'default' : function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        bytes.push(c & 0xff);
      }
      return bytes;
    }
  };

  qrcode.stringToBytes = qrcode.stringToBytesFuncs['default'];

  //---------------------------------------------------------------------
  // qrcode.createStringToBytes
  //---------------------------------------------------------------------

  /**
   * @param unicodeData base64 string of byte array.
   * [16bit Unicode],[16bit Bytes], ...
   * @param numChars
   */
  qrcode.createStringToBytes = function(unicodeData, numChars) {

    // create conversion map.

    var unicodeMap = function() {

      var bin = base64DecodeInputStream(unicodeData);
      var read = function() {
        var b = bin.read();
        if (b == -1) throw 'eof';
        return b;
      };

      var count = 0;
      var unicodeMap = {};
      while (true) {
        var b0 = bin.read();
        if (b0 == -1) break;
        var b1 = read();
        var b2 = read();
        var b3 = read();
        var k = String.fromCharCode( (b0 << 8) | b1);
        var v = (b2 << 8) | b3;
        unicodeMap[k] = v;
        count += 1;
      }
      if (count != numChars) {
        throw count + ' != ' + numChars;
      }

      return unicodeMap;
    }();

    var unknownChar = '?'.charCodeAt(0);

    return function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        if (c < 128) {
          bytes.push(c);
        } else {
          var b = unicodeMap[s.charAt(i)];
          if (typeof b == 'number') {
            if ( (b & 0xff) == b) {
              // 1byte
              bytes.push(b);
            } else {
              // 2bytes
              bytes.push(b >>> 8);
              bytes.push(b & 0xff);
            }
          } else {
            bytes.push(unknownChar);
          }
        }
      }
      return bytes;
    };
  };

  //---------------------------------------------------------------------
  // QRMode
  //---------------------------------------------------------------------

  var QRMode = {
    MODE_NUMBER :    1 << 0,
    MODE_ALPHA_NUM : 1 << 1,
    MODE_8BIT_BYTE : 1 << 2,
    MODE_KANJI :     1 << 3
  };

  //---------------------------------------------------------------------
  // QRErrorCorrectionLevel
  //---------------------------------------------------------------------

  var QRErrorCorrectionLevel = {
    L : 1,
    M : 0,
    Q : 3,
    H : 2
  };

  //---------------------------------------------------------------------
  // QRMaskPattern
  //---------------------------------------------------------------------

  var QRMaskPattern = {
    PATTERN000 : 0,
    PATTERN001 : 1,
    PATTERN010 : 2,
    PATTERN011 : 3,
    PATTERN100 : 4,
    PATTERN101 : 5,
    PATTERN110 : 6,
    PATTERN111 : 7
  };

  //---------------------------------------------------------------------
  // QRUtil
  //---------------------------------------------------------------------

  var QRUtil = function() {

    var PATTERN_POSITION_TABLE = [
      [],
      [6, 18],
      [6, 22],
      [6, 26],
      [6, 30],
      [6, 34],
      [6, 22, 38],
      [6, 24, 42],
      [6, 26, 46],
      [6, 28, 50],
      [6, 30, 54],
      [6, 32, 58],
      [6, 34, 62],
      [6, 26, 46, 66],
      [6, 26, 48, 70],
      [6, 26, 50, 74],
      [6, 30, 54, 78],
      [6, 30, 56, 82],
      [6, 30, 58, 86],
      [6, 34, 62, 90],
      [6, 28, 50, 72, 94],
      [6, 26, 50, 74, 98],
      [6, 30, 54, 78, 102],
      [6, 28, 54, 80, 106],
      [6, 32, 58, 84, 110],
      [6, 30, 58, 86, 114],
      [6, 34, 62, 90, 118],
      [6, 26, 50, 74, 98, 122],
      [6, 30, 54, 78, 102, 126],
      [6, 26, 52, 78, 104, 130],
      [6, 30, 56, 82, 108, 134],
      [6, 34, 60, 86, 112, 138],
      [6, 30, 58, 86, 114, 142],
      [6, 34, 62, 90, 118, 146],
      [6, 30, 54, 78, 102, 126, 150],
      [6, 24, 50, 76, 102, 128, 154],
      [6, 28, 54, 80, 106, 132, 158],
      [6, 32, 58, 84, 110, 136, 162],
      [6, 26, 54, 82, 110, 138, 166],
      [6, 30, 58, 86, 114, 142, 170]
    ];
    var G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
    var G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
    var G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

    var _this = {};

    var getBCHDigit = function(data) {
      var digit = 0;
      while (data != 0) {
        digit += 1;
        data >>>= 1;
      }
      return digit;
    };

    _this.getBCHTypeInfo = function(data) {
      var d = data << 10;
      while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
        d ^= (G15 << (getBCHDigit(d) - getBCHDigit(G15) ) );
      }
      return ( (data << 10) | d) ^ G15_MASK;
    };

    _this.getBCHTypeNumber = function(data) {
      var d = data << 12;
      while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
        d ^= (G18 << (getBCHDigit(d) - getBCHDigit(G18) ) );
      }
      return (data << 12) | d;
    };

    _this.getPatternPosition = function(typeNumber) {
      return PATTERN_POSITION_TABLE[typeNumber - 1];
    };

    _this.getMaskFunction = function(maskPattern) {

      switch (maskPattern) {

      case QRMaskPattern.PATTERN000 :
        return function(i, j) { return (i + j) % 2 == 0; };
      case QRMaskPattern.PATTERN001 :
        return function(i, j) { return i % 2 == 0; };
      case QRMaskPattern.PATTERN010 :
        return function(i, j) { return j % 3 == 0; };
      case QRMaskPattern.PATTERN011 :
        return function(i, j) { return (i + j) % 3 == 0; };
      case QRMaskPattern.PATTERN100 :
        return function(i, j) { return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 == 0; };
      case QRMaskPattern.PATTERN101 :
        return function(i, j) { return (i * j) % 2 + (i * j) % 3 == 0; };
      case QRMaskPattern.PATTERN110 :
        return function(i, j) { return ( (i * j) % 2 + (i * j) % 3) % 2 == 0; };
      case QRMaskPattern.PATTERN111 :
        return function(i, j) { return ( (i * j) % 3 + (i + j) % 2) % 2 == 0; };

      default :
        throw 'bad maskPattern:' + maskPattern;
      }
    };

    _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
      var a = qrPolynomial([1], 0);
      for (var i = 0; i < errorCorrectLength; i += 1) {
        a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0) );
      }
      return a;
    };

    _this.getLengthInBits = function(mode, type) {

      if (1 <= type && type < 10) {

        // 1 - 9

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 10;
        case QRMode.MODE_ALPHA_NUM : return 9;
        case QRMode.MODE_8BIT_BYTE : return 8;
        case QRMode.MODE_KANJI     : return 8;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 27) {

        // 10 - 26

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 12;
        case QRMode.MODE_ALPHA_NUM : return 11;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 10;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 41) {

        // 27 - 40

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 14;
        case QRMode.MODE_ALPHA_NUM : return 13;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 12;
        default :
          throw 'mode:' + mode;
        }

      } else {
        throw 'type:' + type;
      }
    };

    _this.getLostPoint = function(qrcode) {

      var moduleCount = qrcode.getModuleCount();

      var lostPoint = 0;

      // LEVEL1

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount; col += 1) {

          var sameCount = 0;
          var dark = qrcode.isDark(row, col);

          for (var r = -1; r <= 1; r += 1) {

            if (row + r < 0 || moduleCount <= row + r) {
              continue;
            }

            for (var c = -1; c <= 1; c += 1) {

              if (col + c < 0 || moduleCount <= col + c) {
                continue;
              }

              if (r == 0 && c == 0) {
                continue;
              }

              if (dark == qrcode.isDark(row + r, col + c) ) {
                sameCount += 1;
              }
            }
          }

          if (sameCount > 5) {
            lostPoint += (3 + sameCount - 5);
          }
        }
      };

      // LEVEL2

      for (var row = 0; row < moduleCount - 1; row += 1) {
        for (var col = 0; col < moduleCount - 1; col += 1) {
          var count = 0;
          if (qrcode.isDark(row, col) ) count += 1;
          if (qrcode.isDark(row + 1, col) ) count += 1;
          if (qrcode.isDark(row, col + 1) ) count += 1;
          if (qrcode.isDark(row + 1, col + 1) ) count += 1;
          if (count == 0 || count == 4) {
            lostPoint += 3;
          }
        }
      }

      // LEVEL3

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount - 6; col += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row, col + 1)
              &&  qrcode.isDark(row, col + 2)
              &&  qrcode.isDark(row, col + 3)
              &&  qrcode.isDark(row, col + 4)
              && !qrcode.isDark(row, col + 5)
              &&  qrcode.isDark(row, col + 6) ) {
            lostPoint += 40;
          }
        }
      }

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount - 6; row += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row + 1, col)
              &&  qrcode.isDark(row + 2, col)
              &&  qrcode.isDark(row + 3, col)
              &&  qrcode.isDark(row + 4, col)
              && !qrcode.isDark(row + 5, col)
              &&  qrcode.isDark(row + 6, col) ) {
            lostPoint += 40;
          }
        }
      }

      // LEVEL4

      var darkCount = 0;

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount; row += 1) {
          if (qrcode.isDark(row, col) ) {
            darkCount += 1;
          }
        }
      }

      var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
      lostPoint += ratio * 10;

      return lostPoint;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // QRMath
  //---------------------------------------------------------------------

  var QRMath = function() {

    var EXP_TABLE = new Array(256);
    var LOG_TABLE = new Array(256);

    // initialize tables
    for (var i = 0; i < 8; i += 1) {
      EXP_TABLE[i] = 1 << i;
    }
    for (var i = 8; i < 256; i += 1) {
      EXP_TABLE[i] = EXP_TABLE[i - 4]
        ^ EXP_TABLE[i - 5]
        ^ EXP_TABLE[i - 6]
        ^ EXP_TABLE[i - 8];
    }
    for (var i = 0; i < 255; i += 1) {
      LOG_TABLE[EXP_TABLE[i] ] = i;
    }

    var _this = {};

    _this.glog = function(n) {

      if (n < 1) {
        throw 'glog(' + n + ')';
      }

      return LOG_TABLE[n];
    };

    _this.gexp = function(n) {

      while (n < 0) {
        n += 255;
      }

      while (n >= 256) {
        n -= 255;
      }

      return EXP_TABLE[n];
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrPolynomial
  //---------------------------------------------------------------------

  function qrPolynomial(num, shift) {

    if (typeof num.length == 'undefined') {
      throw num.length + '/' + shift;
    }

    var _num = function() {
      var offset = 0;
      while (offset < num.length && num[offset] == 0) {
        offset += 1;
      }
      var _num = new Array(num.length - offset + shift);
      for (var i = 0; i < num.length - offset; i += 1) {
        _num[i] = num[i + offset];
      }
      return _num;
    }();

    var _this = {};

    _this.getAt = function(index) {
      return _num[index];
    };

    _this.getLength = function() {
      return _num.length;
    };

    _this.multiply = function(e) {

      var num = new Array(_this.getLength() + e.getLength() - 1);

      for (var i = 0; i < _this.getLength(); i += 1) {
        for (var j = 0; j < e.getLength(); j += 1) {
          num[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i) ) + QRMath.glog(e.getAt(j) ) );
        }
      }

      return qrPolynomial(num, 0);
    };

    _this.mod = function(e) {

      if (_this.getLength() - e.getLength() < 0) {
        return _this;
      }

      var ratio = QRMath.glog(_this.getAt(0) ) - QRMath.glog(e.getAt(0) );

      var num = new Array(_this.getLength() );
      for (var i = 0; i < _this.getLength(); i += 1) {
        num[i] = _this.getAt(i);
      }

      for (var i = 0; i < e.getLength(); i += 1) {
        num[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i) ) + ratio);
      }

      // recursive call
      return qrPolynomial(num, 0).mod(e);
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // QRRSBlock
  //---------------------------------------------------------------------

  var QRRSBlock = function() {

    var RS_BLOCK_TABLE = [

      // L
      // M
      // Q
      // H

      // 1
      [1, 26, 19],
      [1, 26, 16],
      [1, 26, 13],
      [1, 26, 9],

      // 2
      [1, 44, 34],
      [1, 44, 28],
      [1, 44, 22],
      [1, 44, 16],

      // 3
      [1, 70, 55],
      [1, 70, 44],
      [2, 35, 17],
      [2, 35, 13],

      // 4
      [1, 100, 80],
      [2, 50, 32],
      [2, 50, 24],
      [4, 25, 9],

      // 5
      [1, 134, 108],
      [2, 67, 43],
      [2, 33, 15, 2, 34, 16],
      [2, 33, 11, 2, 34, 12],

      // 6
      [2, 86, 68],
      [4, 43, 27],
      [4, 43, 19],
      [4, 43, 15],

      // 7
      [2, 98, 78],
      [4, 49, 31],
      [2, 32, 14, 4, 33, 15],
      [4, 39, 13, 1, 40, 14],

      // 8
      [2, 121, 97],
      [2, 60, 38, 2, 61, 39],
      [4, 40, 18, 2, 41, 19],
      [4, 40, 14, 2, 41, 15],

      // 9
      [2, 146, 116],
      [3, 58, 36, 2, 59, 37],
      [4, 36, 16, 4, 37, 17],
      [4, 36, 12, 4, 37, 13],

      // 10
      [2, 86, 68, 2, 87, 69],
      [4, 69, 43, 1, 70, 44],
      [6, 43, 19, 2, 44, 20],
      [6, 43, 15, 2, 44, 16],

      // 11
      [4, 101, 81],
      [1, 80, 50, 4, 81, 51],
      [4, 50, 22, 4, 51, 23],
      [3, 36, 12, 8, 37, 13],

      // 12
      [2, 116, 92, 2, 117, 93],
      [6, 58, 36, 2, 59, 37],
      [4, 46, 20, 6, 47, 21],
      [7, 42, 14, 4, 43, 15],

      // 13
      [4, 133, 107],
      [8, 59, 37, 1, 60, 38],
      [8, 44, 20, 4, 45, 21],
      [12, 33, 11, 4, 34, 12],

      // 14
      [3, 145, 115, 1, 146, 116],
      [4, 64, 40, 5, 65, 41],
      [11, 36, 16, 5, 37, 17],
      [11, 36, 12, 5, 37, 13],

      // 15
      [5, 109, 87, 1, 110, 88],
      [5, 65, 41, 5, 66, 42],
      [5, 54, 24, 7, 55, 25],
      [11, 36, 12, 7, 37, 13],

      // 16
      [5, 122, 98, 1, 123, 99],
      [7, 73, 45, 3, 74, 46],
      [15, 43, 19, 2, 44, 20],
      [3, 45, 15, 13, 46, 16],

      // 17
      [1, 135, 107, 5, 136, 108],
      [10, 74, 46, 1, 75, 47],
      [1, 50, 22, 15, 51, 23],
      [2, 42, 14, 17, 43, 15],

      // 18
      [5, 150, 120, 1, 151, 121],
      [9, 69, 43, 4, 70, 44],
      [17, 50, 22, 1, 51, 23],
      [2, 42, 14, 19, 43, 15],

      // 19
      [3, 141, 113, 4, 142, 114],
      [3, 70, 44, 11, 71, 45],
      [17, 47, 21, 4, 48, 22],
      [9, 39, 13, 16, 40, 14],

      // 20
      [3, 135, 107, 5, 136, 108],
      [3, 67, 41, 13, 68, 42],
      [15, 54, 24, 5, 55, 25],
      [15, 43, 15, 10, 44, 16],

      // 21
      [4, 144, 116, 4, 145, 117],
      [17, 68, 42],
      [17, 50, 22, 6, 51, 23],
      [19, 46, 16, 6, 47, 17],

      // 22
      [2, 139, 111, 7, 140, 112],
      [17, 74, 46],
      [7, 54, 24, 16, 55, 25],
      [34, 37, 13],

      // 23
      [4, 151, 121, 5, 152, 122],
      [4, 75, 47, 14, 76, 48],
      [11, 54, 24, 14, 55, 25],
      [16, 45, 15, 14, 46, 16],

      // 24
      [6, 147, 117, 4, 148, 118],
      [6, 73, 45, 14, 74, 46],
      [11, 54, 24, 16, 55, 25],
      [30, 46, 16, 2, 47, 17],

      // 25
      [8, 132, 106, 4, 133, 107],
      [8, 75, 47, 13, 76, 48],
      [7, 54, 24, 22, 55, 25],
      [22, 45, 15, 13, 46, 16],

      // 26
      [10, 142, 114, 2, 143, 115],
      [19, 74, 46, 4, 75, 47],
      [28, 50, 22, 6, 51, 23],
      [33, 46, 16, 4, 47, 17],

      // 27
      [8, 152, 122, 4, 153, 123],
      [22, 73, 45, 3, 74, 46],
      [8, 53, 23, 26, 54, 24],
      [12, 45, 15, 28, 46, 16],

      // 28
      [3, 147, 117, 10, 148, 118],
      [3, 73, 45, 23, 74, 46],
      [4, 54, 24, 31, 55, 25],
      [11, 45, 15, 31, 46, 16],

      // 29
      [7, 146, 116, 7, 147, 117],
      [21, 73, 45, 7, 74, 46],
      [1, 53, 23, 37, 54, 24],
      [19, 45, 15, 26, 46, 16],

      // 30
      [5, 145, 115, 10, 146, 116],
      [19, 75, 47, 10, 76, 48],
      [15, 54, 24, 25, 55, 25],
      [23, 45, 15, 25, 46, 16],

      // 31
      [13, 145, 115, 3, 146, 116],
      [2, 74, 46, 29, 75, 47],
      [42, 54, 24, 1, 55, 25],
      [23, 45, 15, 28, 46, 16],

      // 32
      [17, 145, 115],
      [10, 74, 46, 23, 75, 47],
      [10, 54, 24, 35, 55, 25],
      [19, 45, 15, 35, 46, 16],

      // 33
      [17, 145, 115, 1, 146, 116],
      [14, 74, 46, 21, 75, 47],
      [29, 54, 24, 19, 55, 25],
      [11, 45, 15, 46, 46, 16],

      // 34
      [13, 145, 115, 6, 146, 116],
      [14, 74, 46, 23, 75, 47],
      [44, 54, 24, 7, 55, 25],
      [59, 46, 16, 1, 47, 17],

      // 35
      [12, 151, 121, 7, 152, 122],
      [12, 75, 47, 26, 76, 48],
      [39, 54, 24, 14, 55, 25],
      [22, 45, 15, 41, 46, 16],

      // 36
      [6, 151, 121, 14, 152, 122],
      [6, 75, 47, 34, 76, 48],
      [46, 54, 24, 10, 55, 25],
      [2, 45, 15, 64, 46, 16],

      // 37
      [17, 152, 122, 4, 153, 123],
      [29, 74, 46, 14, 75, 47],
      [49, 54, 24, 10, 55, 25],
      [24, 45, 15, 46, 46, 16],

      // 38
      [4, 152, 122, 18, 153, 123],
      [13, 74, 46, 32, 75, 47],
      [48, 54, 24, 14, 55, 25],
      [42, 45, 15, 32, 46, 16],

      // 39
      [20, 147, 117, 4, 148, 118],
      [40, 75, 47, 7, 76, 48],
      [43, 54, 24, 22, 55, 25],
      [10, 45, 15, 67, 46, 16],

      // 40
      [19, 148, 118, 6, 149, 119],
      [18, 75, 47, 31, 76, 48],
      [34, 54, 24, 34, 55, 25],
      [20, 45, 15, 61, 46, 16]
    ];

    var qrRSBlock = function(totalCount, dataCount) {
      var _this = {};
      _this.totalCount = totalCount;
      _this.dataCount = dataCount;
      return _this;
    };

    var _this = {};

    var getRsBlockTable = function(typeNumber, errorCorrectionLevel) {

      switch(errorCorrectionLevel) {
      case QRErrorCorrectionLevel.L :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
      case QRErrorCorrectionLevel.M :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
      case QRErrorCorrectionLevel.Q :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
      case QRErrorCorrectionLevel.H :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
      default :
        return undefined;
      }
    };

    _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {

      var rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);

      if (typeof rsBlock == 'undefined') {
        throw 'bad rs block @ typeNumber:' + typeNumber +
            '/errorCorrectionLevel:' + errorCorrectionLevel;
      }

      var length = rsBlock.length / 3;

      var list = [];

      for (var i = 0; i < length; i += 1) {

        var count = rsBlock[i * 3 + 0];
        var totalCount = rsBlock[i * 3 + 1];
        var dataCount = rsBlock[i * 3 + 2];

        for (var j = 0; j < count; j += 1) {
          list.push(qrRSBlock(totalCount, dataCount) );
        }
      }

      return list;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrBitBuffer
  //---------------------------------------------------------------------

  var qrBitBuffer = function() {

    var _buffer = [];
    var _length = 0;

    var _this = {};

    _this.getBuffer = function() {
      return _buffer;
    };

    _this.getAt = function(index) {
      var bufIndex = Math.floor(index / 8);
      return ( (_buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
    };

    _this.put = function(num, length) {
      for (var i = 0; i < length; i += 1) {
        _this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
      }
    };

    _this.getLengthInBits = function() {
      return _length;
    };

    _this.putBit = function(bit) {

      var bufIndex = Math.floor(_length / 8);
      if (_buffer.length <= bufIndex) {
        _buffer.push(0);
      }

      if (bit) {
        _buffer[bufIndex] |= (0x80 >>> (_length % 8) );
      }

      _length += 1;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrNumber
  //---------------------------------------------------------------------

  var qrNumber = function(data) {

    var _mode = QRMode.MODE_NUMBER;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var data = _data;

      var i = 0;

      while (i + 2 < data.length) {
        buffer.put(strToNum(data.substring(i, i + 3) ), 10);
        i += 3;
      }

      if (i < data.length) {
        if (data.length - i == 1) {
          buffer.put(strToNum(data.substring(i, i + 1) ), 4);
        } else if (data.length - i == 2) {
          buffer.put(strToNum(data.substring(i, i + 2) ), 7);
        }
      }
    };

    var strToNum = function(s) {
      var num = 0;
      for (var i = 0; i < s.length; i += 1) {
        num = num * 10 + chatToNum(s.charAt(i) );
      }
      return num;
    };

    var chatToNum = function(c) {
      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      }
      throw 'illegal char :' + c;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrAlphaNum
  //---------------------------------------------------------------------

  var qrAlphaNum = function(data) {

    var _mode = QRMode.MODE_ALPHA_NUM;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var s = _data;

      var i = 0;

      while (i + 1 < s.length) {
        buffer.put(
          getCode(s.charAt(i) ) * 45 +
          getCode(s.charAt(i + 1) ), 11);
        i += 2;
      }

      if (i < s.length) {
        buffer.put(getCode(s.charAt(i) ), 6);
      }
    };

    var getCode = function(c) {

      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      } else if ('A' <= c && c <= 'Z') {
        return c.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
      } else {
        switch (c) {
        case ' ' : return 36;
        case '$' : return 37;
        case '%' : return 38;
        case '*' : return 39;
        case '+' : return 40;
        case '-' : return 41;
        case '.' : return 42;
        case '/' : return 43;
        case ':' : return 44;
        default :
          throw 'illegal char :' + c;
        }
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qr8BitByte
  //---------------------------------------------------------------------

  var qr8BitByte = function(data) {

    var _mode = QRMode.MODE_8BIT_BYTE;
    var _data = data;
    var _bytes = qrcode.stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _bytes.length;
    };

    _this.write = function(buffer) {
      for (var i = 0; i < _bytes.length; i += 1) {
        buffer.put(_bytes[i], 8);
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrKanji
  //---------------------------------------------------------------------

  var qrKanji = function(data) {

    var _mode = QRMode.MODE_KANJI;
    var _data = data;

    var stringToBytes = qrcode.stringToBytesFuncs['SJIS'];
    if (!stringToBytes) {
      throw 'sjis not supported.';
    }
    !function(c, code) {
      // self test for sjis support.
      var test = stringToBytes(c);
      if (test.length != 2 || ( (test[0] << 8) | test[1]) != code) {
        throw 'sjis not supported.';
      }
    }('\u53cb', 0x9746);

    var _bytes = stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return ~~(_bytes.length / 2);
    };

    _this.write = function(buffer) {

      var data = _bytes;

      var i = 0;

      while (i + 1 < data.length) {

        var c = ( (0xff & data[i]) << 8) | (0xff & data[i + 1]);

        if (0x8140 <= c && c <= 0x9FFC) {
          c -= 0x8140;
        } else if (0xE040 <= c && c <= 0xEBBF) {
          c -= 0xC140;
        } else {
          throw 'illegal char at ' + (i + 1) + '/' + c;
        }

        c = ( (c >>> 8) & 0xff) * 0xC0 + (c & 0xff);

        buffer.put(c, 13);

        i += 2;
      }

      if (i < data.length) {
        throw 'illegal char at ' + (i + 1);
      }
    };

    return _this;
  };

  //=====================================================================
  // GIF Support etc.
  //

  //---------------------------------------------------------------------
  // byteArrayOutputStream
  //---------------------------------------------------------------------

  var byteArrayOutputStream = function() {

    var _bytes = [];

    var _this = {};

    _this.writeByte = function(b) {
      _bytes.push(b & 0xff);
    };

    _this.writeShort = function(i) {
      _this.writeByte(i);
      _this.writeByte(i >>> 8);
    };

    _this.writeBytes = function(b, off, len) {
      off = off || 0;
      len = len || b.length;
      for (var i = 0; i < len; i += 1) {
        _this.writeByte(b[i + off]);
      }
    };

    _this.writeString = function(s) {
      for (var i = 0; i < s.length; i += 1) {
        _this.writeByte(s.charCodeAt(i) );
      }
    };

    _this.toByteArray = function() {
      return _bytes;
    };

    _this.toString = function() {
      var s = '';
      s += '[';
      for (var i = 0; i < _bytes.length; i += 1) {
        if (i > 0) {
          s += ',';
        }
        s += _bytes[i];
      }
      s += ']';
      return s;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64EncodeOutputStream
  //---------------------------------------------------------------------

  var base64EncodeOutputStream = function() {

    var _buffer = 0;
    var _buflen = 0;
    var _length = 0;
    var _base64 = '';

    var _this = {};

    var writeEncoded = function(b) {
      _base64 += String.fromCharCode(encode(b & 0x3f) );
    };

    var encode = function(n) {
      if (n < 0) {
        // error.
      } else if (n < 26) {
        return 0x41 + n;
      } else if (n < 52) {
        return 0x61 + (n - 26);
      } else if (n < 62) {
        return 0x30 + (n - 52);
      } else if (n == 62) {
        return 0x2b;
      } else if (n == 63) {
        return 0x2f;
      }
      throw 'n:' + n;
    };

    _this.writeByte = function(n) {

      _buffer = (_buffer << 8) | (n & 0xff);
      _buflen += 8;
      _length += 1;

      while (_buflen >= 6) {
        writeEncoded(_buffer >>> (_buflen - 6) );
        _buflen -= 6;
      }
    };

    _this.flush = function() {

      if (_buflen > 0) {
        writeEncoded(_buffer << (6 - _buflen) );
        _buffer = 0;
        _buflen = 0;
      }

      if (_length % 3 != 0) {
        // padding
        var padlen = 3 - _length % 3;
        for (var i = 0; i < padlen; i += 1) {
          _base64 += '=';
        }
      }
    };

    _this.toString = function() {
      return _base64;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64DecodeInputStream
  //---------------------------------------------------------------------

  var base64DecodeInputStream = function(str) {

    var _str = str;
    var _pos = 0;
    var _buffer = 0;
    var _buflen = 0;

    var _this = {};

    _this.read = function() {

      while (_buflen < 8) {

        if (_pos >= _str.length) {
          if (_buflen == 0) {
            return -1;
          }
          throw 'unexpected end of file./' + _buflen;
        }

        var c = _str.charAt(_pos);
        _pos += 1;

        if (c == '=') {
          _buflen = 0;
          return -1;
        } else if (c.match(/^\s$/) ) {
          // ignore if whitespace.
          continue;
        }

        _buffer = (_buffer << 6) | decode(c.charCodeAt(0) );
        _buflen += 6;
      }

      var n = (_buffer >>> (_buflen - 8) ) & 0xff;
      _buflen -= 8;
      return n;
    };

    var decode = function(c) {
      if (0x41 <= c && c <= 0x5a) {
        return c - 0x41;
      } else if (0x61 <= c && c <= 0x7a) {
        return c - 0x61 + 26;
      } else if (0x30 <= c && c <= 0x39) {
        return c - 0x30 + 52;
      } else if (c == 0x2b) {
        return 62;
      } else if (c == 0x2f) {
        return 63;
      } else {
        throw 'c:' + c;
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // gifImage (B/W)
  //---------------------------------------------------------------------

  var gifImage = function(width, height) {

    var _width = width;
    var _height = height;
    var _data = new Array(width * height);

    var _this = {};

    _this.setPixel = function(x, y, pixel) {
      _data[y * _width + x] = pixel;
    };

    _this.write = function(out) {

      //---------------------------------
      // GIF Signature

      out.writeString('GIF87a');

      //---------------------------------
      // Screen Descriptor

      out.writeShort(_width);
      out.writeShort(_height);

      out.writeByte(0x80); // 2bit
      out.writeByte(0);
      out.writeByte(0);

      //---------------------------------
      // Global Color Map

      // black
      out.writeByte(0x00);
      out.writeByte(0x00);
      out.writeByte(0x00);

      // white
      out.writeByte(0xff);
      out.writeByte(0xff);
      out.writeByte(0xff);

      //---------------------------------
      // Image Descriptor

      out.writeString(',');
      out.writeShort(0);
      out.writeShort(0);
      out.writeShort(_width);
      out.writeShort(_height);
      out.writeByte(0);

      //---------------------------------
      // Local Color Map

      //---------------------------------
      // Raster Data

      var lzwMinCodeSize = 2;
      var raster = getLZWRaster(lzwMinCodeSize);

      out.writeByte(lzwMinCodeSize);

      var offset = 0;

      while (raster.length - offset > 255) {
        out.writeByte(255);
        out.writeBytes(raster, offset, 255);
        offset += 255;
      }

      out.writeByte(raster.length - offset);
      out.writeBytes(raster, offset, raster.length - offset);
      out.writeByte(0x00);

      //---------------------------------
      // GIF Terminator
      out.writeString(';');
    };

    var bitOutputStream = function(out) {

      var _out = out;
      var _bitLength = 0;
      var _bitBuffer = 0;

      var _this = {};

      _this.write = function(data, length) {

        if ( (data >>> length) != 0) {
          throw 'length over';
        }

        while (_bitLength + length >= 8) {
          _out.writeByte(0xff & ( (data << _bitLength) | _bitBuffer) );
          length -= (8 - _bitLength);
          data >>>= (8 - _bitLength);
          _bitBuffer = 0;
          _bitLength = 0;
        }

        _bitBuffer = (data << _bitLength) | _bitBuffer;
        _bitLength = _bitLength + length;
      };

      _this.flush = function() {
        if (_bitLength > 0) {
          _out.writeByte(_bitBuffer);
        }
      };

      return _this;
    };

    var getLZWRaster = function(lzwMinCodeSize) {

      var clearCode = 1 << lzwMinCodeSize;
      var endCode = (1 << lzwMinCodeSize) + 1;
      var bitLength = lzwMinCodeSize + 1;

      // Setup LZWTable
      var table = lzwTable();

      for (var i = 0; i < clearCode; i += 1) {
        table.add(String.fromCharCode(i) );
      }
      table.add(String.fromCharCode(clearCode) );
      table.add(String.fromCharCode(endCode) );

      var byteOut = byteArrayOutputStream();
      var bitOut = bitOutputStream(byteOut);

      // clear code
      bitOut.write(clearCode, bitLength);

      var dataIndex = 0;

      var s = String.fromCharCode(_data[dataIndex]);
      dataIndex += 1;

      while (dataIndex < _data.length) {

        var c = String.fromCharCode(_data[dataIndex]);
        dataIndex += 1;

        if (table.contains(s + c) ) {

          s = s + c;

        } else {

          bitOut.write(table.indexOf(s), bitLength);

          if (table.size() < 0xfff) {

            if (table.size() == (1 << bitLength) ) {
              bitLength += 1;
            }

            table.add(s + c);
          }

          s = c;
        }
      }

      bitOut.write(table.indexOf(s), bitLength);

      // end code
      bitOut.write(endCode, bitLength);

      bitOut.flush();

      return byteOut.toByteArray();
    };

    var lzwTable = function() {

      var _map = {};
      var _size = 0;

      var _this = {};

      _this.add = function(key) {
        if (_this.contains(key) ) {
          throw 'dup key:' + key;
        }
        _map[key] = _size;
        _size += 1;
      };

      _this.size = function() {
        return _size;
      };

      _this.indexOf = function(key) {
        return _map[key];
      };

      _this.contains = function(key) {
        return typeof _map[key] != 'undefined';
      };

      return _this;
    };

    return _this;
  };

  var createDataURL = function(width, height, getPixel) {
    var gif = gifImage(width, height);
    for (var y = 0; y < height; y += 1) {
      for (var x = 0; x < width; x += 1) {
        gif.setPixel(x, y, getPixel(x, y) );
      }
    }

    var b = byteArrayOutputStream();
    gif.write(b);

    var base64 = base64EncodeOutputStream();
    var bytes = b.toByteArray();
    for (var i = 0; i < bytes.length; i += 1) {
      base64.writeByte(bytes[i]);
    }
    base64.flush();

    return 'data:image/gif;base64,' + base64;
  };

  //---------------------------------------------------------------------
  // returns qrcode function.

  return qrcode;
}();

// multibyte support
!function() {

  qrcode.stringToBytesFuncs['UTF-8'] = function(s) {
    // http://stackoverflow.com/questions/18729405/how-to-convert-utf8-string-to-byte-array
    function toUTF8Array(str) {
      var utf8 = [];
      for (var i=0; i < str.length; i++) {
        var charcode = str.charCodeAt(i);
        if (charcode < 0x80) utf8.push(charcode);
        else if (charcode < 0x800) {
          utf8.push(0xc0 | (charcode >> 6),
              0x80 | (charcode & 0x3f));
        }
        else if (charcode < 0xd800 || charcode >= 0xe000) {
          utf8.push(0xe0 | (charcode >> 12),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
        // surrogate pair
        else {
          i++;
          // UTF-16 encodes 0x10000-0x10FFFF by
          // subtracting 0x10000 and splitting the
          // 20 bits of 0x0-0xFFFFF into two halves
          charcode = 0x10000 + (((charcode & 0x3ff)<<10)
            | (str.charCodeAt(i) & 0x3ff));
          utf8.push(0xf0 | (charcode >>18),
              0x80 | ((charcode>>12) & 0x3f),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
      }
      return utf8;
    }
    return toUTF8Array(s);
  };

}();

      return qrcode;
    })();
    qrCodeGenerator.stringToBytes = qrCodeGenerator.stringToBytesFuncs["UTF-8"];

    const NS = "remotedesk.settings";
    const ROUTES = {
      status: "/api/remotedesk.status",
      invite: "/api/remotedesk.invite",
      revoke: "/api/remotedesk.revoke",
      project: "/api/remotedesk.project",
      panel: "/api/remotedesk.panel",
    };
    const PANEL_PROPS = { name: "settings.section", id: "remotedesk", order: 40, locale: NS };

    const zh = {
      "nav": "RemoteDesk",
      "subtitle": "本机远程桥接服务：状态、项目、已配对设备与配对码。",
      "refresh": "刷新",
      "loading": "正在读取状态…",
      "loadError": "读取失败：{message}",
      "actionError": "操作失败：{message}",
      "service.title": "服务",
      "service.unconfigured": "该 state 目录尚未初始化：先用 panel 命令或原生 host 启动一次服务，再回到这里。",
      "service.host": "监听地址",
      "service.lock": "锁文件",
      "service.stateUp": "运行中",
      "service.stateDown": "未运行",
      "service.stateStale": "锁文件异常",
      "service.pid": "进程 PID",
      "service.lockMissing": "缺失",
      "service.lockStale": "已失效",
      "service.lockActive": "有效",
      "service.sessions": "会话",
      "service.operations": "进行中的操作",
      "service.sessionCount": "{count} 个",
      "panel.title": "本机控制面板",
      "panel.hint": "在浏览器中打开插件自带的本机控制面板（仅 127.0.0.1，带一次性令牌）。",
      "panel.open": "打开本机控制面板",
      "panel.opening": "正在启动面板…",
      "panel.running": "面板已在 {port} 端口运行",
      "panel.opened": "已打开本机面板（{port}）",
      "panel.reused": "已复用正在运行的面板（{port}）",
      "pair.title": "配对手机",
      "pair.hint": "生成一个 120 秒有效的邀请。配对角色的权限在服务端校验。",
      "pair.role": "角色",
      "pair.roleViewer": "只读（只能查看项目和会话）",
      "pair.roleOperator": "可操作（可以对话、批准操作、查看差异）",
      "pair.every": "全部项目（含 DSH 工作区）",
      "pair.everyHint": "以后在 DSH 里新增的工作区也会开放给这台设备",
      "pair.step1": "手机打开 RemoteDesk：设置 → 远程 AI → 添加主机，选 DSH",
      "pair.step2": "填这台电脑的局域网 IP 和端口，进入「配对与保存」",
      "pair.step3": "点「扫描电脑上的配对二维码」扫这里，再点「配对并连接」",
      "pair.projects": "授权项目",
      "pair.generate": "生成 120 秒邀请",
      "pair.generating": "正在生成…",
      "pair.method": "配对方式",
      "pair.methodQr": "二维码（默认）",
      "pair.methodLink": "链接配对",
      "pair.qrHint": "用手机扫描二维码；二维码不可用时切换到链接配对。",
      "pair.linkHint": "复制链接并在支持 RemoteDesk 配对的客户端打开。",
      "pair.qrUnavailable": "二维码暂时不可用，请切换到链接配对。",
      "pair.copyLink": "复制配对链接",
      "pair.copyPayload": "复制邀请 JSON",
      "pair.payloadCopied": "邀请 JSON 已复制",
      "pair.payloadHint": "二维码只含精简邀请（CA 指纹），手机会从电脑的证书链核对 CA；链接和完整 JSON 含完整邀请。",
      "pair.selectAll": "全选项目",
      "pair.clear": "清空选择",
      "pair.live": "已生成，剩余 {time}",
      "pair.progressLabel": "邀请有效期",
      "pair.progressAria": "邀请剩余时间 {time}",
      "pair.pending": "存在一个未过期的邀请，剩余 {time}（配对码只在生成时显示一次）",
      "pair.expired": "配对码已过期，请重新生成。",
      "pair.none": "当前没有未过期的邀请，刷新页面也无法再取回已生成的配对码。",
      "pair.empty": "还没有登记项目；可以选「全部项目」，或在下方添加。",
      "pair.copy": "复制配对码",
      "pair.copied": "已复制",
      "pair.details": "完整配对信息（JSON，供客户端导入）",
      "pair.caWarning": "完整信息里含 CA 证书，同样只在生成时显示一次。",
      "projects.title": "项目",
      "projects.empty": "尚未配置项目。",
      "projects.id": "ID",
      "projects.name": "名称",
      "projects.path": "本机路径",
      "projects.model": "模型",
      "projects.vision": "视觉",
      "projects.add": "添加项目",
      "projects.adding": "正在添加…",
      "projects.addedHint": "已写入插件 state，服务重启后加载新项目。",
      "projects.idPlaceholder": "项目 ID",
      "projects.pathPlaceholder": "本机绝对路径",
      "projects.titlePlaceholder": "显示名称（可选）",
      "devices.title": "已配对设备",
      "devices.empty": "尚未配对设备。",
      "devices.name": "设备",
      "devices.role": "角色",
      "devices.projects": "授权项目",
      "devices.status": "状态",
      "devices.paired": "已配对",
      "devices.revoked": "已撤销",
      "devices.expired": "已过期",
      "devices.expires": "到期",
      "devices.revoke": "撤销",
      "devices.revoking": "正在撤销…",
      "devices.revokeConfirm": "撤销设备 {name} 的远程访问？",
      "devices.noHeartbeat": "协议没有在线心跳：这里显示的是授权状态，不代表设备此刻在线。",
      "yes": "是",
      "no": "否",
    };

    const en = {
      "nav": "RemoteDesk",
      "subtitle": "Local remote-bridge service: status, projects, paired devices and pairing codes.",
      "refresh": "Refresh",
      "loading": "Reading status…",
      "loadError": "Read failed: {message}",
      "actionError": "Action failed: {message}",
      "service.title": "Service",
      "service.unconfigured": "This state directory is not initialized yet: start the service once (panel command or native host) and come back.",
      "service.host": "Listener",
      "service.lock": "Lock file",
      "service.stateUp": "Running",
      "service.stateDown": "Stopped",
      "service.stateStale": "Stale lock",
      "service.pid": "PID",
      "service.lockMissing": "missing",
      "service.lockStale": "stale",
      "service.lockActive": "active",
      "service.sessions": "Sessions",
      "service.operations": "Operations in flight",
      "service.sessionCount": "{count}",
      "panel.title": "Local control panel",
      "panel.hint": "Open the plugin's own loopback control panel in a browser (127.0.0.1 only, one-time token).",
      "panel.open": "Open local control panel",
      "panel.opening": "Starting the panel…",
      "panel.running": "Panel already running on port {port}",
      "panel.opened": "Opened the local panel ({port})",
      "panel.reused": "Reused the running panel ({port})",
      "pair.title": "Pairing code",
      "pair.hint": "Mint an invitation valid for 120 seconds. The paired role is enforced by the host.",
      "pair.role": "Role",
      "pair.roleViewer": "Viewer (read only)",
      "pair.roleOperator": "Operator (chat, approve, see diffs)",
      "pair.every": "All projects (incl. DSH workspaces)",
      "pair.everyHint": "Workspaces added in DSH later are included too",
      "pair.step1": "On the phone: RemoteDesk → Settings → Remote AI → Add host, choose DSH",
      "pair.step2": "Enter this computer's LAN IP and port, go to Pair & save",
      "pair.step3": "Tap Scan the pairing QR on the computer, then Pair & connect",
      "pair.projects": "Authorized projects",
      "pair.generate": "Generate pairing code",
      "pair.generating": "Generating…",
      "pair.method": "Pairing method",
      "pair.methodQr": "QR code (default)",
      "pair.methodLink": "Pairing link",
      "pair.qrHint": "Scan this QR code with the client. Switch to the pairing link if QR is unavailable.",
      "pair.linkHint": "Copy the link and open it in a client that supports RemoteDesk pairing.",
      "pair.qrUnavailable": "QR generation is unavailable. Switch to the pairing link.",
      "pair.copyLink": "Copy pairing link",
      "pair.copyPayload": "Copy invite JSON",
      "pair.payloadCopied": "Invite JSON copied",
      "pair.payloadHint": "Import the QR code, pairing link or full JSON. The short code is for local diagnostics only.",
      "pair.selectAll": "Select all projects",
      "pair.clear": "Clear selection",
      "pair.live": "Generated, {time} left",
      "pair.progressLabel": "Invitation lifetime",
      "pair.progressAria": "Invitation time remaining: {time}",
      "pair.pending": "An unexpired invitation exists, {time} left (a code is shown only when it is minted)",
      "pair.expired": "The pairing code expired. Generate a new one.",
      "pair.none": "No unexpired invitation. A minted code cannot be read back after a reload.",
      "pair.empty": "No projects yet — add one below first.",
      "pair.copy": "Copy code",
      "pair.copied": "Copied",
      "pair.details": "Full pairing payload (JSON, for the client)",
      "pair.caWarning": "The full payload carries the CA certificate and is likewise shown only once.",
      "projects.title": "Projects",
      "projects.empty": "No projects configured.",
      "projects.id": "ID",
      "projects.name": "Name",
      "projects.path": "Local path",
      "projects.model": "Model",
      "projects.vision": "Vision",
      "projects.add": "Add project",
      "projects.adding": "Adding…",
      "projects.addedHint": "Written to plugin state; the service loads new projects after a restart.",
      "projects.idPlaceholder": "Project ID",
      "projects.pathPlaceholder": "Absolute local path",
      "projects.titlePlaceholder": "Display name (optional)",
      "devices.title": "Paired devices",
      "devices.empty": "No paired devices.",
      "devices.name": "Device",
      "devices.role": "Role",
      "devices.projects": "Projects",
      "devices.status": "Status",
      "devices.paired": "paired",
      "devices.revoked": "revoked",
      "devices.expired": "expired",
      "devices.expires": "Expires",
      "devices.revoke": "Revoke",
      "devices.revoking": "Revoking…",
      "devices.revokeConfirm": "Revoke remote access for {name}?",
      "devices.noHeartbeat": "The protocol has no liveness heartbeat: this shows authorization state, not whether a device is online right now.",
      "yes": "yes",
      "no": "no",
    };

    const CSS = [
      ".rd_root{display:flex;flex-direction:column;gap:20px;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-primary)}",
      ".rd_row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}",
      ".rd_head{display:flex;align-items:flex-start;gap:12px}",
      ".rd_sub{margin:0;flex:1;color:var(--dsw-alias-label-secondary);font-size:12.5px}",
      ".rd_statusStrip{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0;padding:8px 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-2)}",
      ".rd_card{display:flex;flex-direction:column;gap:14px;padding:16px 18px;border:.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2))}",
      ".rd_cardHead{display:flex;align-items:center;gap:10px;min-height:32px;flex-wrap:wrap}",
      ".rd_title{flex:1;margin:0;font-size:13.5px;font-weight:600;letter-spacing:.01em}",
      ".rd_grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px 22px}",
      ".rd_field{display:flex;flex-direction:column;gap:2px;min-width:0}",
      ".rd_label{color:var(--dsw-alias-label-secondary);font-size:12px}",
      ".rd_value{color:var(--dsw-alias-label-primary);font-size:13px;font-variant-numeric:tabular-nums;word-break:break-word}",
      ".rd_btn{flex:0 0 auto;white-space:nowrap;font:inherit;font-size:13px;height:32px;padding:0 14px;border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;transition:background .12s ease}",
      ".rd_btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
      ".rd_btn:disabled{opacity:.45;cursor:default}",
      ".rd_btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}",
      ".rd_primary{border-color:transparent;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);font-weight:500}",
      ".rd_primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}",
      ".rd_danger{color:var(--dsw-alias-state-error-primary)}",
      ".rd_danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}",
      ".rd_input,.rd_select{flex:1 1 140px;font:inherit;font-size:13px;height:32px;min-width:0;padding:0 10px;border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}",
      ".rd_input::placeholder{color:var(--dsw-alias-label-caption)}",
      ".rd_input:focus-visible,.rd_select:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary)}",
      ".rd_grow{flex:1;min-width:200px}",
      ".rd_codeRow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}",
      ".rd_code{flex:1;min-width:220px;padding:12px 14px;border:.5px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-markdown-code-block);color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:17px;font-weight:600;letter-spacing:.06em;line-height:1.5;word-break:break-all}",
      ".rd_badge{display:inline-flex;align-items:center;padding:2px 9px;border-radius:999px;font-size:11.5px;font-weight:500;line-height:18px;white-space:nowrap}",
      ".rd_badgeOk{background:var(--dsw-alias-state-success-tertiary);color:var(--dsw-alias-state-success-primary)}",
      ".rd_badgeWarn{background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-state-warn-label)}",
      ".rd_badgeBad{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}",
      ".rd_badgeMuted{background:var(--dsw-alias-markdown-inline-code);color:var(--dsw-alias-label-secondary)}",
      ".rd_list{display:flex;flex-direction:column}",
      ".rd_item{display:flex;flex-direction:column;gap:3px;padding:11px 0;border-bottom:.5px solid var(--dsw-alias-border-l1)}",
      ".rd_item:first-child{padding-top:2px}",
      ".rd_item:last-child{border-bottom:none;padding-bottom:2px}",
      ".rd_itemHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      ".rd_itemTitle{font-weight:500;color:var(--dsw-alias-label-primary);word-break:break-word}",
      ".rd_itemMeta{display:flex;align-items:center;gap:6px 14px;flex-wrap:wrap;font-size:12.5px;color:var(--dsw-alias-label-secondary)}",
      ".rd_path{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:var(--dsw-alias-label-tertiary);word-break:break-all}",
      ".rd_spacer{flex:1 1 auto}",
      ".rd_num{font-variant-numeric:tabular-nums}",
      ".rd_hint{margin:0;color:var(--dsw-alias-label-secondary);font-size:12.5px}",
      ".rd_error{margin:0;color:var(--dsw-alias-state-error-primary);font-size:12.5px}",
      ".rd_mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px}",
      ".rd_muted{color:var(--dsw-alias-label-tertiary)}",
      ".rd_details summary{cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12.5px}",
      ".rd_json{margin:8px 0 0;padding:12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-markdown-code-block);max-height:220px;overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-all}",
      ".rd_checks{display:flex;gap:8px;flex-wrap:wrap}",
      ".rd_check{display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);font-size:12.5px;cursor:pointer}",
      ".rd_check:hover{background:var(--dsw-alias-interactive-bg-hover)}",
      ".rd_checkOn{border-color:var(--dsw-alias-brand-primary)}",
      ".rd_nowrap{white-space:nowrap}",
      ".rd_wrap{word-break:break-all}",
      ".rd_badgeWrap{white-space:normal}",
      ".rd_pairMethod{display:flex;align-items:center;gap:10px;flex-wrap:wrap}",
      ".rd_qrRow{display:flex;align-items:center;gap:22px;flex-wrap:wrap}",
      ".rd_qrBox{display:flex;justify-content:center;flex:0 0 auto;width:min(236px,100%);max-width:100%;padding:12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:16px;background:#fff;box-shadow:0 6px 24px rgba(0,0,0,.08);overflow:visible}",
      ".rd_qr{display:block;width:min(212px,calc(100vw - 96px));height:auto;aspect-ratio:1;line-height:0;image-rendering:pixelated}",
      ".rd_steps{flex:1 1 220px;margin:0;padding-left:18px;display:flex;flex-direction:column;gap:8px;color:var(--dsw-alias-label-primary);font-size:13px}",
      ".rd_checkWide{flex-basis:100%}",
      ".rd_checkText{display:flex;flex-direction:column;line-height:1.35}",
      ".rd_qr svg{display:block;width:100%;height:100%;shape-rendering:crispEdges}",
      ".rd_countdown{display:flex;flex-direction:column;gap:6px;flex:1 1 220px;min-width:190px}",
      ".rd_countdownHead{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}",
      ".rd_progressTrack{height:7px;overflow:hidden;border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-state-warn-tertiary)}",
      ".rd_progressFill{display:block;height:100%;border-radius:inherit;background:var(--dsw-alias-brand-primary);transition:width .25s linear}",
      ".rd_link{padding:12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-markdown-code-block);color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.55;word-break:break-all;user-select:text}",
      ".rd_srOnly{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}",
    ].join("");

    function ensureStyles() {
      if (typeof document === "undefined") return;
      const id = "@remotedesk/dsh-plugin/panel.css";
      if (document.querySelector("style[data-plugin-css=" + JSON.stringify(id) + "]") !== null) return;
      const tag = document.createElement("style");
      tag.dataset.plugin = "@remotedesk/dsh-plugin";
      tag.dataset.pluginCss = id;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    async function call(path, body) {
      const response = await fetch(path, {
        method: body === undefined ? "GET" : "POST",
        credentials: "same-origin",
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      let data = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }
      if (!response.ok) throw new Error(data.error || "HTTP_" + String(response.status));
      return data;
    }

    function formatRemaining(expires, now) {
      const seconds = Math.max(0, Math.ceil((expires - now) / 1000));
      return String(Math.floor(seconds / 60)) + ":" + String(seconds % 60).padStart(2, "0");
    }

    const INVITE_TTL_MS = 120000;

    function remainingRatio(expires, now, issuedAt) {
      const end = Number(expires);
      const start = Number.isSafeInteger(issuedAt) ? issuedAt : end - INVITE_TTL_MS;
      const duration = Math.max(1, end - start);
      return Math.min(1, Math.max(0, (end - now) / duration));
    }

    function base64Url(value) {
      const bytes = new TextEncoder().encode(value);
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    }

    function pairingLink(invite, service, engine) {
      const host = typeof service?.host === "string" ? service.host.trim() : "";
      const port = Number(service?.port);
      let url = "";
      if (host !== "" && Number.isInteger(port) && port > 0 && port < 65536) {
        const authority = host.includes(":") && !host.startsWith("[") ? "[" + host + "]" : host;
        url = "https://" + authority + ":" + String(port);
      }
      const payload = {
        type: "remotedesk-pair",
        version: 1,
        engine,
        ...(url === "" ? {} : { url }),
        invite: {
          code: invite.code,
          expires: invite.expires,
          ca: invite.ca,
          serverInstance: invite.serverInstance,
        },
      };
      return "remotedesk://pair?data=" + base64Url(JSON.stringify(payload));
    }

    function qrSvg(value) {
      const qr = qrCodeGenerator(0, "M");
      qr.addData(value, "Byte");
      qr.make();
      return qr.createSvgTag(4, 4, "RemoteDesk pairing QR", "RemoteDesk");
    }

    function formatTime(value) {
      if (!Number.isSafeInteger(value)) return "—";
      return new Date(value).toLocaleString();
    }

    function Card({ title, badge, action, children }) {
      return React.createElement(
        "section",
        { className: "rd_card" },
        React.createElement(
          "div",
          { className: "rd_cardHead" },
          React.createElement("h3", { className: "rd_title" }, title),
          badge,
          action,
        ),
        children,
      );
    }

    function Badge({ tone, children }) {
      return React.createElement("span", { className: "rd_badge " + tone }, children);
    }

    function InviteCountdown({ expires, now, issuedAt, copy }) {
      const time = formatRemaining(expires, now);
      const ratio = remainingRatio(expires, now, issuedAt);
      const percent = Math.round(ratio * 100);
      return React.createElement(
        "div",
        { className: "rd_countdown", role: "group", "aria-label": copy("pair.progressAria", { time }) },
        React.createElement(
          "div",
          { className: "rd_countdownHead" },
          React.createElement("span", { className: "rd_label" }, copy("pair.progressLabel")),
          React.createElement(Badge, { tone: "rd_badgeWarn" }, copy("pair.live", { time })),
        ),
        React.createElement(
          "div",
          {
            className: "rd_progressTrack",
            role: "progressbar",
            "aria-label": copy("pair.progressAria", { time }),
            "aria-valuemin": 0,
            "aria-valuemax": 100,
            "aria-valuenow": percent,
            "aria-valuetext": time,
          },
          React.createElement("span", { className: "rd_progressFill", style: { width: percent + "%" } }),
        ),
      );
    }

    function Field({ label, children }) {
      return React.createElement(
        "div",
        { className: "rd_field" },
        React.createElement("span", { className: "rd_label" }, label),
        React.createElement("span", { className: "rd_value" }, children),
      );
    }

    function RemoteDeskSection({ copy }) {
      const t = copy;
      const [snapshot, setSnapshot] = React.useState(null);
      const [error, setError] = React.useState("");
      const [busy, setBusy] = React.useState("");
      const [notice, setNotice] = React.useState("");
      const [invite, setInvite] = React.useState(null);
      const [inviteIssuedAt, setInviteIssuedAt] = React.useState(null);
      const [pairingMethod, setPairingMethod] = React.useState("qr");
      const [pairingLinkValue, setPairingLinkValue] = React.useState("");
      const [qrSvgValue, setQrSvgValue] = React.useState("");
      const [qrError, setQrError] = React.useState("");
      const [role, setRole] = React.useState("operator");
      const [selectedProjects, setSelectedProjects] = React.useState([]);
      const [draft, setDraft] = React.useState({ id: "", path: "", title: "" });
      const [now, setNow] = React.useState(() => Date.now());

      const refresh = React.useCallback(async () => {
        try {
          setSnapshot(await call(ROUTES.status));
          setError("");
        } catch (failure) {
          setError(t("loadError", { message: failure.message }));
        }
      }, [t]);

      React.useEffect(() => {
        ensureStyles();
        void refresh();
        const timer = setInterval(() => void refresh(), 10000);
        return () => clearInterval(timer);
      }, [refresh]);

      React.useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
      }, []);

      const run = async (key, action) => {
        setBusy(key);
        setNotice("");
        try {
          await action();
        } catch (failure) {
          setError(t("actionError", { message: failure.message }));
        } finally {
          setBusy("");
        }
      };

      const generate = () =>
        run("invite", async () => {
          const result = await call(ROUTES.invite, { projects: selectedProjects, role });
          const nextInvite = result.invite;
          const nextLink = pairingLink(nextInvite, snapshot?.service, snapshot?.engine || "dsh");
          setInvite(nextInvite);
          setInviteIssuedAt(nextInvite.expires - INVITE_TTL_MS);
          setPairingMethod("qr");
          setPairingLinkValue(nextLink);
          try {
            // The QR carries the compact invite (the CA's fingerprint, ~200 bytes) the host computed, so it stays
            // scannable on small screens; RemoteDesk takes the CA from the TLS chain. The link keeps the whole invite.
            setQrSvgValue(qrSvg(typeof result.qrText === "string" && result.qrText !== "" ? result.qrText : JSON.stringify(nextInvite)));
            setQrError("");
          } catch {
            setQrSvgValue("");
            setQrError(t("pair.qrUnavailable"));
          }
          setNow(Date.now());
          await refresh();
        });

      const revoke = (device) =>
        run("revoke:" + device.id, async () => {
          if (typeof window !== "undefined" && !window.confirm(t("devices.revokeConfirm", { name: device.name || device.id })))
            return;
          await call(ROUTES.revoke, { device: device.id });
          await refresh();
        });

      const addProject = () =>
        run("project", async () => {
          await call(ROUTES.project, {
            id: draft.id,
            path: draft.path,
            ...(draft.title === "" ? {} : { title: draft.title }),
          });
          setDraft({ id: "", path: "", title: "" });
          setNotice(t("projects.addedHint"));
          await refresh();
        });

      const openPanel = () =>
        run("panel", async () => {
          const result = await call(ROUTES.panel, {});
          setNotice(t(result.reused === true ? "panel.reused" : "panel.opened", { port: String(result.port) }));
          if (typeof window !== "undefined") window.open(result.url, "_blank", "noopener,noreferrer");
          await refresh();
        });

      const copyText = (value, message = "pair.copied") =>
        run("copy", async () => {
          if (typeof navigator !== "undefined" && navigator.clipboard !== undefined) {
            await navigator.clipboard.writeText(value);
          } else if (typeof document !== "undefined") {
            const textarea = document.createElement("textarea");
            textarea.value = value;
            textarea.setAttribute("readonly", "");
            textarea.style.position = "fixed";
            textarea.style.opacity = "0";
            document.body.appendChild(textarea);
            textarea.select();
            const copied = document.execCommand("copy");
            textarea.remove();
            if (!copied) throw new Error("CLIPBOARD_UNAVAILABLE");
          } else {
            throw new Error("CLIPBOARD_UNAVAILABLE");
          }
          setNotice(t(message));
        });

      const toggleProject = (id) =>
        setSelectedProjects((current) => {
          const picked = current.filter((entry) => entry !== "*");
          return picked.includes(id) ? picked.filter((entry) => entry !== id) : [...picked, id];
        });

      const projects = snapshot === null ? [] : snapshot.projects;
      const devices = snapshot === null ? [] : snapshot.devices;
      const live = invite !== null && invite.expires > now;
      const pending = live ? null : snapshot === null ? null : snapshot.invite;
      const countdownInvite = live ? invite : pending;
      const countdownIssuedAt = live ? inviteIssuedAt : pending === null ? null : pending.expires - INVITE_TTL_MS;
      const service = snapshot === null ? null : snapshot.service;
      const panelRunning = snapshot !== null && snapshot.panel.running;
      const sessionCount = snapshot !== null && Array.isArray(snapshot.sessions)
        ? snapshot.sessions.length
        : Number(snapshot?.sessions ?? 0);
      const operationCount = snapshot !== null && snapshot.operations !== null && typeof snapshot.operations === "object"
        ? Object.values(snapshot.operations).reduce((total, value) => total + Number(value || 0), 0)
        : Number(snapshot?.operations ?? 0);
      const everyProject = selectedProjects.includes("*");
      const allProjectsSelected = everyProject || (projects.length > 0 && selectedProjects.length === projects.length);
      React.useEffect(() => {
        setSelectedProjects((current) => {
          const valid = current.filter((id) => id === "*" || projects.some((project) => project.id === id));
          if (valid.length === 0) return projects.length === 1 ? [projects[0].id] : ["*"];
          return valid;
        });
      }, [snapshot]);
      const toggleAllProjects = () => setSelectedProjects(allProjectsSelected ? [] : projects.map((project) => project.id));
      // "*": every project, including the DSH app's own workspaces as they come and go (exclusive with single picks).
      const toggleEvery = () => setSelectedProjects(everyProject ? [] : ["*"]);
      const serviceCard =
        service === null
          ? React.createElement(
              Card,
              { title: t("service.title") },
              React.createElement("p", { className: "rd_hint" }, t("service.unconfigured")),
            )
          : React.createElement(
              Card,
              {
                title: t("service.title"),
                badge: React.createElement(
                  Badge,
                  { tone: service.running === true ? "rd_badgeOk" : service.lock === "stale" ? "rd_badgeWarn" : "rd_badgeMuted" },
                  service.running === true ? t("service.stateUp") : service.lock === "stale" ? t("service.stateStale") : t("service.stateDown"),
                ),
                action: React.createElement(
                  "button",
                  { type: "button", className: "rd_btn", onClick: openPanel, disabled: busy !== "" },
                  busy === "panel" ? t("panel.opening") : t("panel.open"),
                ),
              },
              React.createElement(
                "div",
                { className: "rd_grid" },
                React.createElement(Field, { label: t("service.host") },
                  React.createElement("span", { className: "rd_mono" }, service.host + ":" + String(service.port))),
                React.createElement(Field, { label: t("service.lock") },
                  service.lock === "active"
                    ? t("service.lockActive")
                    : service.lock === "missing"
                      ? t("service.lockMissing")
                      : t("service.lockStale")),
                React.createElement(Field, { label: t("service.sessions") },
                  React.createElement("span", { className: "rd_num" },
                    t("service.sessionCount", { count: String(sessionCount) }))),
                React.createElement(Field, { label: t("service.operations") },
                  React.createElement("span", { className: "rd_num" }, String(operationCount))),
                service.running === true && service.pid !== undefined
                  ? React.createElement(Field, { label: t("service.pid") },
                      React.createElement("span", { className: "rd_mono rd_num" }, String(service.pid)))
                  : null,
              ),
              React.createElement(
                "p",
                { className: "rd_hint" },
                panelRunning
                  ? t("panel.running", { port: String(snapshot.panel.port) })
                  : t("panel.hint"),
              ),
            );

      return React.createElement(
        "div",
        { className: "rd_root" },
        React.createElement(
          "div",
          { className: "rd_head" },
          React.createElement("p", { className: "rd_sub" }, t("subtitle")),
          React.createElement(
            "button",
            { type: "button", className: "rd_btn", onClick: () => void refresh(), disabled: busy !== "" },
            t("refresh"),
          ),
        ),
        error !== "" ? React.createElement("p", { className: "rd_error" }, error) : null,
        notice !== "" ? React.createElement("p", { className: "rd_statusStrip", role: "status" }, notice) : null,
        snapshot === null
          ? error === ""
            ? React.createElement("p", { className: "rd_hint" }, t("loading"))
            : null
          : React.createElement(
              React.Fragment,
              null,
              serviceCard,
              React.createElement(
                Card,
                {
                  title: t("pair.title"),
                  badge:
                    countdownInvite === null
                      ? null
                      : React.createElement(InviteCountdown, {
                          expires: countdownInvite.expires,
                          now,
                          issuedAt: countdownIssuedAt,
                          copy: t,
                        }),
                },
                false
                  ? null
                  : React.createElement(
                      React.Fragment,
                      null,
                      React.createElement(
                        "div",
                        { className: "rd_row" },
                        React.createElement("span", { className: "rd_label" }, t("pair.role")),
                        React.createElement(
                          "select",
                          { className: "rd_select", "aria-label": t("pair.role"), value: role, onChange: (event) => setRole(event.target.value) },
                          React.createElement("option", { value: "viewer" }, t("pair.roleViewer")),
                          React.createElement("option", { value: "operator" }, t("pair.roleOperator")),
                        ),
                      ),
                      React.createElement(
                        "div",
                        { className: "rd_field" },
                        React.createElement("span", { className: "rd_label" }, t("pair.projects")),
                        React.createElement(
                          "div",
                          { className: "rd_checks" },
                          React.createElement(
                            "label",
                            { className: "rd_check rd_checkWide" + (everyProject ? " rd_checkOn" : ""), key: "*" },
                            React.createElement("input", {
                              type: "checkbox",
                              "aria-label": t("pair.every"),
                              checked: everyProject,
                              onChange: toggleEvery,
                            }),
                            React.createElement(
                              "span",
                              { className: "rd_checkText" },
                              React.createElement("b", null, t("pair.every")),
                              React.createElement("small", { className: "rd_muted" }, t("pair.everyHint")),
                            ),
                          ),
                          projects.map((project) =>
                            React.createElement(
                              "label",
                              {
                                className:
                                  "rd_check" +
                                  (selectedProjects.includes(project.id) && !everyProject ? " rd_checkOn" : ""),
                                key: project.id,
                              },
                              React.createElement("input", {
                                type: "checkbox",
                                "aria-label": project.title,
                                checked: selectedProjects.includes(project.id) && !everyProject,
                                onChange: () => toggleProject(project.id),
                              }),
                              project.title,
                            ),
                          ),
                        ),
                      ),
                      React.createElement(
                        "div",
                        { className: "rd_row" },
                        React.createElement(
                          "button",
                          { type: "button", className: "rd_btn", onClick: toggleAllProjects, disabled: busy !== "" },
                          allProjectsSelected ? t("pair.clear") : t("pair.selectAll"),
                        ),
                        React.createElement(
                          "button",
                          {
                            type: "button",
                            className: "rd_btn rd_primary",
                            onClick: generate,
                            disabled: busy !== "" || selectedProjects.length === 0,
                          },
                          busy === "invite" ? t("pair.generating") : t("pair.generate"),
                        ),
                      ),
                    ),
                live
                  ? React.createElement(
                      React.Fragment,
                      null,
                      React.createElement(
                        "div",
                        { className: "rd_pairMethod" },
                        React.createElement("span", { className: "rd_label" }, t("pair.method")),
                        React.createElement(
                          "select",
                          { className: "rd_select", "aria-label": t("pair.method"), value: pairingMethod, onChange: (event) => setPairingMethod(event.target.value) },
                          React.createElement("option", { value: "qr" }, t("pair.methodQr")),
                          React.createElement("option", { value: "link" }, t("pair.methodLink")),
                        ),
                      ),
                      pairingMethod === "qr"
                        ? qrSvgValue === ""
                          ? React.createElement("p", { className: "rd_error" }, qrError || t("pair.qrUnavailable"))
                          : React.createElement(
                              React.Fragment,
                              null,
                              React.createElement(
                                "div",
                                { className: "rd_qrRow" },
                                React.createElement(
                                  "div",
                                  { className: "rd_qrBox", role: "img", "aria-label": t("pair.methodQr") },
                                  React.createElement("div", { className: "rd_qr", dangerouslySetInnerHTML: { __html: qrSvgValue } }),
                                ),
                                React.createElement(
                                  "ol",
                                  { className: "rd_steps" },
                                  React.createElement("li", null, t("pair.step1")),
                                  React.createElement("li", null, t("pair.step2")),
                                  React.createElement("li", null, t("pair.step3")),
                                ),
                              ),
                            )
                        : React.createElement(
                            React.Fragment,
                            null,
                            React.createElement("div", { className: "rd_link" }, pairingLinkValue),
                            React.createElement(
                              "div",
                              { className: "rd_codeRow" },
                              React.createElement("p", { className: "rd_hint" }, t("pair.linkHint")),
                              React.createElement(
                                "button",
                                { type: "button", className: "rd_btn", onClick: () => copyText(pairingLinkValue), disabled: busy !== "" },
                                t("pair.copyLink"),
                              ),
                            ),
                          ),
                      React.createElement("p", { className: "rd_hint" }, t("pair.payloadHint")),
                      React.createElement(
                        "details",
                        { className: "rd_details" },
                        React.createElement("summary", null, t("pair.details")),
                        React.createElement("pre", { className: "rd_json" }, JSON.stringify(invite, null, 2)),
                        React.createElement(
                          "button",
                          { type: "button", className: "rd_btn", onClick: () => copyText(JSON.stringify(invite, null, 2), "pair.payloadCopied"), disabled: busy !== "" },
                          t("pair.copyPayload"),
                        ),
                      ),
                      React.createElement("p", { className: "rd_hint" }, t("pair.caWarning")),
                    )
                  : pending !== null
                    ? React.createElement("p", { className: "rd_hint" }, t("pair.pending", { time: formatRemaining(pending.expires, now) }))
                    : React.createElement(
                        "p",
                        { className: "rd_hint" },
                        invite !== null ? t("pair.expired") : t("pair.none"),
                      ),
              ),
              React.createElement(
                Card,
                { title: t("projects.title") },
                projects.length === 0
                  ? React.createElement("p", { className: "rd_hint" }, t("projects.empty"))
                  : React.createElement(
                      "div",
                      { className: "rd_list" },
                      projects.map((project) =>
                        React.createElement(
                          "div",
                          { className: "rd_item", key: project.id },
                          React.createElement(
                            "div",
                            { className: "rd_itemHead" },
                            React.createElement("span", { className: "rd_itemTitle" }, project.title),
                            React.createElement(
                              Badge,
                              { tone: "rd_badgeMuted" },
                              (project.model || "—") + (project.vision ? " · " + t("projects.vision") : ""),
                            ),
                          ),
                          React.createElement("span", { className: "rd_mono rd_muted" }, project.id),
                          React.createElement("span", { className: "rd_path" }, project.path),
                        ),
                      ),
                    ),
                React.createElement(
                  "div",
                  { className: "rd_row" },
                  React.createElement("input", {
                    className: "rd_input",
                    "aria-label": t("projects.idPlaceholder"),
                    placeholder: t("projects.idPlaceholder"),
                    value: draft.id,
                    onChange: (event) => setDraft({ ...draft, id: event.target.value }),
                  }),
                  React.createElement("input", {
                    className: "rd_input rd_grow",
                    "aria-label": t("projects.pathPlaceholder"),
                    placeholder: t("projects.pathPlaceholder"),
                    value: draft.path,
                    onChange: (event) => setDraft({ ...draft, path: event.target.value }),
                  }),
                  React.createElement("input", {
                    className: "rd_input",
                    "aria-label": t("projects.titlePlaceholder"),
                    placeholder: t("projects.titlePlaceholder"),
                    value: draft.title,
                    onChange: (event) => setDraft({ ...draft, title: event.target.value }),
                  }),
                  React.createElement(
                    "button",
                    {
                      type: "button",
                      className: "rd_btn",
                      onClick: addProject,
                      disabled: busy !== "" || draft.id === "" || draft.path === "",
                    },
                    busy === "project" ? t("projects.adding") : t("projects.add"),
                  ),
                ),
              ),
              React.createElement(
                Card,
                { title: t("devices.title") },
                devices.length === 0
                  ? React.createElement("p", { className: "rd_hint" }, t("devices.empty"))
                  : React.createElement(
                      "div",
                      { className: "rd_list" },
                      devices.map((device) =>
                        React.createElement(
                          "div",
                          { className: "rd_item", key: device.id },
                          React.createElement(
                            "div",
                            { className: "rd_itemHead" },
                            React.createElement("span", { className: "rd_itemTitle" }, device.name || "—"),
                            React.createElement(
                              Badge,
                              {
                                tone:
                                  device.status === "paired"
                                    ? "rd_badgeOk"
                                    : device.status === "expired"
                                      ? "rd_badgeWarn"
                                      : "rd_badgeBad",
                              },
                              t("devices." + device.status),
                            ),
                            React.createElement("span", { className: "rd_spacer" }),
                            device.revoked
                              ? null
                              : React.createElement(
                                  "button",
                                  {
                                    type: "button",
                                    className: "rd_btn rd_danger",
                                    disabled: busy !== "",
                                    onClick: () => revoke(device),
                                  },
                                  busy === "revoke:" + device.id ? t("devices.revoking") : t("devices.revoke"),
                                ),
                          ),
                          React.createElement(
                            "div",
                            { className: "rd_itemMeta" },
                            React.createElement("span", null, t("devices.role") + " " + device.role),
                            React.createElement(
                              "span",
                              null,
                              t("devices.projects") + " " + (device.projects.join(", ") || "—"),
                            ),
                            React.createElement("span", { className: "rd_mono" }, device.id.slice(0, 12)),
                            React.createElement(
                              "span",
                              { className: "rd_num" },
                              t("devices.expires") + " " + formatTime(device.expires),
                            ),
                          ),
                        ),
                      ),
                    ),
                React.createElement("p", { className: "rd_hint" }, t("devices.noHeartbeat")),
              ),
            ),
      );
    }

    /** Services this browser plugin requires. */
    const inject = ["slots", "locale"];

    function apply(ctx) {
      ensureStyles();
      const copy = ctx.locale.bind(NS);
      ctx.effect(
        () => ctx.locale.register(NS, { zh, en }),
        "remotedesk-settings: section dictionaries",
      );
      ctx.slots.inject("settings.section", () =>
        ctx.slots.register(
          {
            ...PANEL_PROPS,
            label: () => copy("nav"),
            inject: () => ({ copy }),
          },
          RemoteDeskSection,
        ),
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
