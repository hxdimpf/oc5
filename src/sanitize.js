//
// utils/sanitize.js
//
// HTML and BBCode sanitization for cache descriptions.
// Handles URL rewriting for images and links to work with the proxy.
//

const { parse } = require('node-html-parser');
const yabbcode = require('ya-bbcode');

//----------------------------------------------------------------------------
// BBCode parser setup

const parser = new yabbcode();

const commonColors = [
  'black', 'white', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta',
  'gray', 'darkgray', 'lightgray', 'orange', 'purple', 'pink', 'brown',
  'lime', 'olive', 'teal', 'navy', 'aqua', 'fuchsia', 'silver', 'maroon',
  'gold', 'silver', 'beige', 'coral', 'crimson', 'indigo', 'lavender'
];

commonColors.forEach(color => {
  parser.registerTag(color, {
    type: 'replace',
    open: () => `<span style="color:${color}">`,
    close: '</span>'
  });
});

const emoticons = {
  ';)' : '😉',
  ':)' : '😊',
  ':()': '😞',
  ':D' : '😁',
  ':P' : '😜',
  ':O' : '😲',
  ':|' : '😐',
  ':*' : '😘',
  '8)' : '😎',
  'B)' : '😎',
  ':^)': '😅',
  ':3' : '😺',
  ':/' : '😕',
  ':$' : '😳',
  ':@' : '😡',
  '^'  : '😲',
  ';D' : '😜'
};

Object.keys(emoticons).forEach(emoticon => {
  parser.registerTag(emoticon, {
    type: 'replace',
    open: () => emoticons[emoticon],
    close: ''
  });
});

// note: [s] is "strikethrough" but yabbcode takes it as "size"
parser.registerTag('s', {
  type: 'replace',
  open: () => '<s>',
  close: '</s>'
});

//----------------------------------------------------------------------------
// Valid BBCode tags for detection

const validBBCodeTags = [
  'b', 'i', 'u', 's',       // Basic formatting
  'url', 'link',            // Links
  'img', 'image',           // Images
  'quote', 'q',             // Quotes
  'color', 'colour', 'c',   // Text color
  'size', 'sz',             // Text size
  'list', 'ul', 'ol', 'li', // Lists
  'table', 'tr', 'td', 'th',// Tables
  'center', 'left', 'right',// Alignment shortcuts
  'align',                  // Text alignment
  'font',                   // Font type
  'code'                    // Code block
];

//----------------------------------------------------------------------------
// Detection functions

function containsBBCode(text) {
  if (!text) return false;
  const validTagsPattern = validBBCodeTags.join('|');
  const regex = new RegExp(`(\\[(${validTagsPattern})(?:=[^\\]]*)?\\][^\\[]*\\[\\/\\2\\])|(\\[(${validTagsPattern})\\])`, 'g');
  return regex.test(text);
}

function containsHtml(text) {
  if (!text) return false;
  const htmlTagRegex = /<\/?[a-z][\s\S]*>/i;
  return htmlTagRegex.test(text);
}

//----------------------------------------------------------------------------
// sanitizeHtml()
//
// Main sanitization function that:
// 1. Converts BBCode to HTML if detected
// 2. Rewrites relative URLs to absolute geocaching.com URLs
// 3. Proxies HTTP image URLs through our proxy to avoid mixed content warnings
// 4. Adds img-fluid class to images for responsive display
//
// Dark-mode compatibility is handled separately by descDarkUnsafe.js +
// the light-island CSS class — listings carrying hard-coded colors are
// rendered against a forced light background, so their colors render as
// authored. The sanitizer no longer strips colors.
//
// Challenging examples:
// GC5BNCD has "containsHtml = true", runs through the sanitizer and renders plain tags

function sanitizeHtml(text, referenceCode) {
  if (!text) return '';

  let html = text;
  if (containsBBCode(text)) html = parser.parse(text);

  const root = parse(html, {
    lowerCaseTagName: false,
    script: true,
    style: true,
    pre: true
  });

  const prefixUrl = (url) => {
    if (url && url.startsWith('/')) {
      return `https://www.geocaching.com${url}`;
    }
    return url;
  };

  const proxyUrl = (url) => {
    if (url && url.startsWith('http://') && /\.(jpg|jpeg|png|gif|bmp|svg|webp)$/i.test(url)) {
      return `/proxy?url=${encodeURIComponent(url)}&marker=${referenceCode}`;
    }
    return url;
  };

  root.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src');
    if (src) {
      const newSrc = src.startsWith('/') ? prefixUrl(src) : proxyUrl(src);
      img.setAttribute('src', newSrc);

      // Add 'img-fluid' class preserving existing classes
      const existingClass = img.getAttribute('class') || '';
      const classes = existingClass.split(/\s+/).filter(Boolean);
      if (!classes.includes('img-fluid')) {
        classes.push('img-fluid');
        img.setAttribute('class', classes.join(' '));
      }
    }
  });

  root.querySelectorAll('a').forEach((link) => {
    const href = link.getAttribute('href');
    const imgInside = !!link.querySelector('img');
    if (href && imgInside) {
      const newHref = href.startsWith('/') ? prefixUrl(href) : proxyUrl(href);
      link.setAttribute('href', newHref);
    } else if (href) {
      const newHref = href.startsWith('/') ? prefixUrl(href) : href;
      link.setAttribute('href', newHref);
    }
  });

  // Strip scripts for safety (geocaching.com should have stripped them, but just in case)
  root.querySelectorAll('script').forEach((script) => {
    script.remove();
  });

  return root.querySelector('body') ? root.querySelector('body').innerHTML : root.toString();
}

//----------------------------------------------------------------------------
// sanitizeDescription()
//
// Convenience function for cache descriptions.
// Wraps plain text in a pre-line span, or sanitizes HTML/BBCode content.

function sanitizeDescription(shortDescription, longDescription, referenceCode) {
  const description = (shortDescription || '') + (longDescription || '');

  if (!description) return '';

  if (containsHtml(description) || containsBBCode(description)) {
    return sanitizeHtml(description, referenceCode);
  } else {
    return `<span style="white-space: pre-line">${description}</span>`;
  }
}

//----------------------------------------------------------------------------
// Exports

module.exports = {
  containsBBCode,
  containsHtml,
  sanitizeHtml,
  sanitizeDescription,
};
