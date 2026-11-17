'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const script = fs.readFileSync('js/age-gate.js', 'utf8');
function simulate(initiallyVerified) {
  const storage = new Map(initiallyVerified ? [['age_verified', 'yes']] : []);
  const classNames = new Set();
  const events = {};
  let overlay = null;
  let accepted = false;
  function node(name) {
    return {
      name,
      listeners: {},
      focus() { this.focused = true; },
      addEventListener(type, handler) { this.listeners[type] = handler; }
    };
  }
  const accept = node('accept'), decline = node('decline');
  const document = {
    readyState: 'loading',
    documentElement: {
      classList: {
        add(x) { classNames.add(x); },
        remove(x) { classNames.delete(x); }
      }
    },
    body: {appendChild(el) { overlay = el; }},
    addEventListener(type, cb) { events[type] = cb; },
    dispatchEvent(event) { if (event.type === 'age-verified') accepted = true; },
    getElementById(id) { return id === 'siteAgeGate' ? overlay : null; },
    createElement(tag) {
      assert.equal(tag, 'div');
      return {
        id: '', className: '', properties: {},
        setAttribute(k,v) { this.properties[k] = v; },
        querySelector(selector) {
          if (selector === '#siteAgeAccept') return accept;
          if (selector === '#siteAgeDecline') return decline;
          return null;
        },
        addEventListener(type,cb) { this[type] = cb; },
        remove() { overlay = null; }
      };
    }
  };
  const localStorage = {
    getItem(k) { return storage.get(k) || null; },
    setItem(k,v) { storage.set(k,v); }
  };
  // No location object: code must never redirect an unverified user.
  const window = {};
  vm.runInNewContext(script, {window, document, localStorage, Event:class Event {constructor(type){this.type=type;}}}, {timeout:500});
  if (events.DOMContentLoaded) events.DOMContentLoaded();
  return {storage, classNames, getOverlay:()=>overlay, accept, decline, wasAccepted:()=>accepted, ageGate:window.AgeGate};
}
let a=simulate(false);
assert.equal(a.classNames.has('age-check-required'),true);
assert.equal(a.getOverlay().properties['aria-modal'],'true');
assert.equal(a.accept.focused,true);
assert.equal(a.ageGate.isVerified(),false);
a.accept.listeners.click();
assert.equal(a.ageGate.isVerified(),true);
assert.equal(a.classNames.has('age-check-required'),false);
assert.equal(a.storage.get('age_verified'),'yes');
assert.equal(a.getOverlay(),null);
assert.equal(a.wasAccepted(),true);
let b=simulate(true);
assert.equal(b.getOverlay(),null);
assert.equal(b.classNames.has('age-check-required'),false);
assert.equal(b.ageGate.isVerified(),true);
console.log('Age-gate behavior passed: no redirect, consent persisted, dialog removed on acceptance');
