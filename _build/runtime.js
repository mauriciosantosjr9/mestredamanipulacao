/* Mini-runtime que substitui o support.js do Claude Design (DCLogic).
   Suporta: {{a.b}} em texto/atributos, onXxx="{{fn}}", ref="{{fn}}", <sc-if>, <sc-for>. */
(function () {
  var HOLE = /\{\{\s*([\w.$]+)\s*\}\}/g;
  var ONLY = /^\s*\{\{\s*([\w.$]+)\s*\}\}\s*$/;

  function lookup(vals, path, scope) {
    var parts = path.split('.');
    var cur;
    if (scope && parts[0] === scope.alias) { cur = scope.item(vals); parts = parts.slice(1); }
    else cur = vals;
    for (var i = 0; i < parts.length; i++) { if (cur == null) return undefined; cur = cur[parts[i]]; }
    return cur;
  }
  function interp(tpl, vals, scope) {
    return tpl.replace(HOLE, function (_, p) { var v = lookup(vals, p, scope); return v == null || v === false ? '' : String(v); });
  }

  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (p) {
    var self = this;
    if (typeof p === 'function') p = p(this.state);
    Object.assign(this.state, p);
    if (!this._q && this._mounted) {
      this._q = true;
      Promise.resolve().then(function () { self._q = false; self._render(); });
    }
  };
  DCLogic.prototype.mount = function (root) {
    this._bindings = [];
    this._compileChildren(root, null, this._bindings);
    this._mounted = true;
    this._render();
    if (this.componentDidMount) this.componentDidMount();
  };

  DCLogic.prototype._compileChildren = function (parent, scope, out) {
    var kids = Array.prototype.slice.call(parent.childNodes);
    for (var i = 0; i < kids.length; i++) this._compile(kids[i], scope, out);
  };

  DCLogic.prototype._compile = function (node, scope, out) {
    var self = this;
    if (node.nodeType === 3) {
      if (node.nodeValue.indexOf('{{') >= 0) out.push({ k: 'text', node: node, tpl: node.nodeValue, scope: scope });
      return;
    }
    if (node.nodeType !== 1) return;
    var tag = node.tagName.toLowerCase();
    if (tag === 'sc-for' || tag === 'sc-if') {
      var frag = document.createDocumentFragment();
      while (node.firstChild) frag.appendChild(node.firstChild);
      node.style.display = 'contents';
      var rec;
      if (tag === 'sc-for') {
        var lm = (node.getAttribute('list') || '').match(ONLY);
        rec = { k: 'for', el: node, tpl: frag, list: lm && lm[1], alias: node.getAttribute('as') || 'item', subs: [], n: 0, scope: scope };
      } else {
        var vm = (node.getAttribute('value') || '').match(ONLY);
        rec = { k: 'if', el: node, tpl: frag, path: vm && vm[1], subs: null, scope: scope };
      }
      ['list', 'as', 'value', 'hint-placeholder-count', 'hint-placeholder-val'].forEach(function (a) { node.removeAttribute(a); });
      out.push(rec);
      return;
    }
    var attrs = Array.prototype.slice.call(node.attributes);
    attrs.forEach(function (a) {
      if (a.value.indexOf('{{') < 0) return;
      var name = a.name, m = a.value.match(ONLY);
      if (name === 'ref' && m) { node.removeAttribute('ref'); out.push({ k: 'ref', el: node, path: m[1], scope: scope, last: null }); return; }
      if (/^on[a-z]+$/.test(name) && m) {
        node.removeAttribute(name);
        var ev = name.slice(2), path = m[1];
        node.addEventListener(ev, function (e) {
          var vals = self._vals || {};
          var fn = lookup(vals, path, scope);
          if (typeof fn === 'function') fn(e);
        });
        return;
      }
      out.push({ k: 'attr', el: node, name: name, tpl: a.value, scope: scope, last: undefined });
    });
    this._compileChildren(node, scope, out);
  };

  DCLogic.prototype._update = function (bs, vals) {
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      if (b.k === 'text') {
        var s = interp(b.tpl, vals, b.scope);
        if (s !== b.last) { b.node.nodeValue = s; b.last = s; }
      } else if (b.k === 'attr') {
        var s2 = interp(b.tpl, vals, b.scope);
        if (s2 !== b.last) { b.el.setAttribute(b.name, s2); b.last = s2; }
      } else if (b.k === 'ref') {
        var fn = lookup(vals, b.path, b.scope);
        if (fn !== b.last && typeof fn === 'function') { b.last = fn; try { fn(b.el); } catch (err) { /* ref chamado antes do didMount */ } }
      } else if (b.k === 'if') this._updateIf(b, vals);
      else if (b.k === 'for') this._updateFor(b, vals);
    }
  };

  DCLogic.prototype._updateIf = function (b, vals) {
    var on = !!lookup(vals, b.path, b.scope);
    if (on && !b.subs) {
      b.subs = [];
      var clone = b.tpl.cloneNode(true);
      var holder = document.createElement('div'); holder.appendChild(clone);
      this._compileChildren(holder, b.scope, b.subs);
      while (holder.firstChild) b.el.appendChild(holder.firstChild);
    } else if (!on && b.subs) {
      b.subs.forEach(function (s) { if (s.k === 'ref' && typeof s.last === 'function') { try { s.last(null); } catch (e) {} } });
      b.subs = null; b.el.textContent = '';
      return;
    }
    if (b.subs) this._update(b.subs, vals);
  };

  DCLogic.prototype._updateFor = function (b, vals) {
    var list = lookup(vals, b.list, b.scope) || [];
    if (list.length !== b.n) {
      b.el.textContent = ''; b.subs = []; b.n = list.length;
      for (var i = 0; i < list.length; i++) {
        (function (idx) {
          var sc = { alias: b.alias, item: function (v) { var l = lookup(v, b.list, b.scope) || []; return l[idx]; } };
          var holder = document.createElement('div'); holder.appendChild(b.tpl.cloneNode(true));
          this._compileChildren(holder, sc, b.subs);
          while (holder.firstChild) b.el.appendChild(holder.firstChild);
        }).call(this, i);
      }
    }
    this._update(b.subs, vals);
  };

  DCLogic.prototype._render = function () {
    this._vals = this.renderVals();
    this._update(this._bindings, this._vals);
  };

  window.DCLogic = DCLogic;
})();
