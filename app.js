"use strict";
var C = window.CANTERA;
var sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);
var TYPES = {
  addon:  {label: "Addons",         one: "Addon",         cv: "--c-addon",  ext: "mcaddon"},
  pack:   {label: "Resource packs", one: "Resource pack", cv: "--c-pack",   ext: "mcpack"},
  shader: {label: "Shaders",        one: "Shader",        cv: "--c-shader", ext: "mcpack"},
  world:  {label: "Mundos",         one: "Mundo",         cv: "--c-world",  ext: "mcworld"},
  holo:   {label: "Holoprints",     one: "Holoprint",     cv: "--c-holo",   ext: "mcpack"}
};
var ORDER = ["addon", "pack", "shader", "world", "holo"];
var ADMIN_PAGE = !!document.getElementById("btnAuth");
var MAX_FILE = 50 * 1024 * 1024;
var S = {posts: [], tab: "all", q: "", ver: "", sort: "new", admin: false, user: null, openId: null, loaded: false, adminExists: true};

function add(el, c) {
  if (c == null || c === false) return;
  if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
  el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
}
function h(tag, props) {
  var el = document.createElement(tag);
  props = props || {};
  Object.keys(props).forEach(function (k) {
    var v = props[k];
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, v);
  });
  for (var i = 2; i < arguments.length; i++) {
    var c = arguments[i];
    add(el, arguments[i]);
  }
  return el;
}
function $(id) { return document.getElementById(id); }
function fmtSize(n) { if (!n) return ""; if (n < 1048576) return Math.max(1, Math.round(n / 1024)) + " KB"; return (n / 1048576).toFixed(1) + " MB"; }
function fmtDate(t) { try { return new Date(t).toLocaleDateString("es", {day: "numeric", month: "short", year: "numeric"}); } catch (e) { return ""; } }
function pubUrl(path) { return sb.storage.from(C.BUCKET).getPublicUrl(path).data.publicUrl; }
function toast(msg) {
  var t = h("div", {class: "toast", role: "status", text: msg});
  document.body.appendChild(t);
  setTimeout(function () { t.remove(); }, 3500);
}
function typeColor(t) { return "var(" + (TYPES[t] || TYPES.addon).cv + ")"; }
function slug(s) { return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "archivo"; }

function filtered() {
  var q = S.q.trim().toLowerCase();
  var list = S.posts.filter(function (p) {
    if (S.tab !== "all" && p.type !== S.tab) return false;
    if (S.ver && p.mc_version !== S.ver) return false;
    if (!q) return true;
    return [p.title, p.description, p.author, (p.tags || []).join(" ")].join(" ").toLowerCase().indexOf(q) > -1;
  });
  list.sort(function (a, b) {
    if (S.sort === "old") return new Date(a.created_at) - new Date(b.created_at);
    if (S.sort === "name") return String(a.title).localeCompare(String(b.title), "es");
    if (S.sort === "dl") return (b.downloads || 0) - (a.downloads || 0);
    return new Date(b.created_at) - new Date(a.created_at);
  });
  return list;
}
function renderTabs() {
  var nav = $("tabs"); nav.textContent = "";
  var all = [["all", "Todo", null]].concat(ORDER.map(function (k) { return [k, TYPES[k].label, TYPES[k].cv]; }));
  all.forEach(function (t) {
    var n = t[0] === "all" ? S.posts.length : S.posts.filter(function (p) { return p.type === t[0]; }).length;
    var b = h("button", {class: "tab", type: "button", role: "tab", "aria-selected": String(S.tab === t[0]), onclick: function () { S.tab = t[0]; render(); }});
    var dot = h("i"); if (t[2]) dot.style.setProperty("--dot", "var(" + t[2] + ")"); else dot.style.setProperty("--dot", "currentColor");
    b.appendChild(dot); b.appendChild(document.createTextNode(t[1])); b.appendChild(h("span", {text: String(n)}));
    nav.appendChild(b);
  });
}
function renderVersions() {
  var sel = $("fVer"), vs = {};
  S.posts.forEach(function (p) { if (p.mc_version) vs[p.mc_version] = 1; });
  var keys = Object.keys(vs).sort().reverse();
  sel.textContent = ""; sel.appendChild(h("option", {value: "", text: "Todas"}));
  keys.forEach(function (v) { sel.appendChild(h("option", {value: v, text: v})); });
  if (S.ver && !vs[S.ver]) S.ver = "";
  sel.value = S.ver;
}
function initials(t) {
  var w = String(t).trim().split(/\s+/);
  return ((w[0] || "?").charAt(0) + (w.length > 1 ? w[1].charAt(0) : (w[0] || "").charAt(1))).toUpperCase();
}
function card(p) {
  var t = TYPES[p.type] || TYPES.addon;
  var cover = h("div", {class: "cover" + (p.cover_path ? "" : " ph")}, h("span", {class: "chip", text: t.one}));
  cover.style.setProperty("--tc", typeColor(p.type));
  if (p.cover_path) cover.style.backgroundImage = "url('" + pubUrl(p.cover_path) + "')";
  else cover.appendChild(h("span", {text: initials(p.title)}));
  var meta = h("div", {class: "meta"},
    h("span", {text: p.mc_version ? "Minecraft " + p.mc_version : "Bedrock"}),
    p.author ? h("span", {text: "por " + p.author}) : null,
    p.file_size ? h("span", {text: fmtSize(p.file_size)}) : null,
    h("span", {text: (p.downloads || 0) + (p.downloads === 1 ? " descarga" : " descargas")}));
  var b = h("div", {class: "body"}, h("h3", {text: p.title}), meta, p.description ? h("p", {class: "desc", text: p.description}) : null);
  return h("button", {class: "card", type: "button", onclick: function () { openDetail(p.id); }}, cover, b);
}
function render() {
  renderTabs(); renderVersions(); $("fSort").value = S.sort;
  var list = filtered(), g = $("grid"); g.textContent = "";
  $("count").textContent = list.length + (list.length === 1 ? " resultado" : " resultados");
  $("stPosts").textContent = S.posts.length;
  $("stDl").textContent = S.posts.reduce(function (a, p) { return a + (p.downloads || 0); }, 0);
  if (ADMIN_PAGE) {
    $("btnNew").hidden = !S.admin;
    $("btnAuth").textContent = S.user ? "Salir" : "Entrar";
  }
  if (!list.length) {
    var e = h("div", {class: "empty"});
    if (!S.loaded) e.appendChild(h("h2", {text: "Cargando…"}));
    else if (!S.posts.length) {
      e.appendChild(h("h2", {text: "Aún no hay publicaciones"}));
      e.appendChild(h("p", {text: S.admin ? "Pulsa Publicar para subir el primer addon, pack, shader, mundo o holoprint." : "Pronto habrá contenido nuevo."}));
    } else {
      e.appendChild(h("h2", {text: "Sin resultados"}));
      e.appendChild(h("p", {text: "Prueba con otra búsqueda, categoría o versión de Minecraft."}));
    }
    g.appendChild(e); return;
  }
  list.forEach(function (p) { g.appendChild(card(p)); });
}
function closeSheet() { $("layer").textContent = ""; S.openId = null; }
document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSheet(); });
function openSheet(children) {
  var l = $("layer"); l.textContent = "";
  var sheet = h("div", {class: "sheet", role: "dialog", "aria-modal": "true"});
  children.forEach(function (c) { if (c) sheet.appendChild(c); });
  var bg = h("div", {class: "sheet-bg", onclick: function (e) { if (e.target === bg) closeSheet(); }}, sheet);
  l.appendChild(bg); return sheet;
}
function kv(label, val) { return val ? h("span", {}, label + " ", h("b", {text: val})) : null; }

async function downloadFile(p, btn) {
  var url = pubUrl(p.file_path) + "?download=" + encodeURIComponent(p.file_name || (slug(p.title) + "." + (TYPES[p.type] || TYPES.addon).ext));
  var a = h("a", {href: url, rel: "noopener"}); document.body.appendChild(a); a.click(); a.remove();
  try { await sb.rpc("increment_downloads", {post_id: p.id}); p.downloads = (p.downloads || 0) + 1; render(); } catch (e) {}
}
async function removePost(p) {
  try {
    var paths = [p.file_path, p.cover_path].concat(p.screenshots || []).filter(Boolean);
    var r = await sb.from("posts").delete().eq("id", p.id);
    if (r.error) throw r.error;
    if (paths.length) await sb.storage.from(C.BUCKET).remove(paths);
    S.posts = S.posts.filter(function (x) { return x.id !== p.id; });
    closeSheet(); render(); toast("Publicación eliminada");
  } catch (e) { toast("No se pudo eliminar: " + (e.message || "error")); }
}
function openDetail(id) {
  var p = S.posts.filter(function (x) { return x.id === id; })[0];
  if (!p) { closeSheet(); return; }
  S.openId = id;
  var t = TYPES[p.type] || TYPES.addon, parts = [];
  if (p.cover_path) parts.push(h("img", {class: "big", src: pubUrl(p.cover_path), alt: "Portada de " + p.title}));
  var chip = h("span", {class: "chip", style: "position:static;display:inline-block;margin:12px 0 8px", text: t.one});
  chip.style.setProperty("--tc", typeColor(p.type));
  parts.push(chip, h("h2", {text: p.title}));
  parts.push(h("div", {class: "kv"}, kv("Autor", p.author || "Anónimo"), kv("Minecraft", p.mc_version), kv("Versión", p.version),
    kv("Tamaño", fmtSize(p.file_size)), kv("Publicado", fmtDate(p.created_at)), kv("Descargas", String(p.downloads || 0))));
  if (p.description) parts.push(h("p", {class: "pre", text: p.description}));
  if (p.tags && p.tags.length) parts.push(h("div", {class: "meta"}, p.tags.map(function (x) { return h("span", {text: "#" + x}); })));
  if (p.screenshots && p.screenshots.length) parts.push(h("div", {class: "shots"}, p.screenshots.map(function (s) { return h("img", {src: pubUrl(s), alt: "Captura", loading: "lazy"}); })));
  if (p.file_path) parts.push(h("div", {class: "notice", text: "Cómo instalar: descarga el archivo (." + t.ext + ") y ábrelo con Minecraft Bedrock. Se importa solo."}));
  var acts = [];
  if (p.file_path) {
    var db = h("button", {class: "btn primary", type: "button", text: "Descargar" + (p.file_size ? " (" + fmtSize(p.file_size) + ")" : "")});
    db.addEventListener("click", function () { downloadFile(p, db); }); acts.push(db);
  }
  if (p.link) acts.push(h("a", {class: "btn" + (p.file_path ? "" : " primary"), href: p.link, target: "_blank", rel: "noopener noreferrer", text: p.file_path ? "Enlace alterno" : "Ir a la descarga"}));
  if (S.admin) {
    acts.push(h("button", {class: "btn", type: "button", text: "Editar", onclick: function () { openForm(p); }}));
    var del = h("button", {class: "btn danger", type: "button", text: "Eliminar"}), armed = false;
    del.addEventListener("click", function () {
      if (!armed) { armed = true; del.textContent = "Confirmar eliminación"; setTimeout(function () { armed = false; del.textContent = "Eliminar"; }, 4000); return; }
      removePost(p);
    });
    acts.push(del);
  }
  acts.push(h("button", {class: "btn grow", type: "button", text: "Cerrar", onclick: closeSheet}));
  parts.push(h("div", {class: "actions"}, acts));
  openSheet(parts);
}

/* ---------- Formulario de publicación ---------- */
var IMG_OK = /^image\/(png|jpeg|gif|webp)$/;
function field(label, input, hint) { return h("label", {class: "f"}, h("span", {text: label}), input, hint ? h("span", {class: "hint", text: hint}) : null); }
function fail(msg, text) { msg.textContent = text; msg.hidden = false; }

function openForm(edit) {
  if (!S.admin) { toast("Solo el administrador puede publicar."); return; }
  var e = edit || {};
  var sel = h("select", {id: "fType"}, Object.keys(TYPES).map(function (k) { return h("option", {value: k, text: TYPES[k].one}); }));
  sel.value = e.type || (S.tab !== "all" ? S.tab : "addon");
  var title = h("input", {id: "fTitle", type: "text", maxlength: "100", value: e.title || ""});
  var author = h("input", {id: "fAuthor", type: "text", maxlength: "60", value: e.author || ""});
  var mc = h("input", {id: "fMc", type: "text", maxlength: "20", placeholder: "1.21.80", value: e.mc_version || ""});
  var ver = h("input", {id: "fVersion", type: "text", maxlength: "20", placeholder: "1.0", value: e.version || ""});
  var desc = h("textarea", {id: "fDesc", maxlength: "3000"}); desc.value = e.description || "";
  var tags = h("input", {id: "fTags", type: "text", maxlength: "120", placeholder: "pvp, optimizado, 16x", value: (e.tags || []).join(", ")});
  var link = h("input", {id: "fLink", type: "url", placeholder: "https://", value: e.link || ""});
  var cover = h("input", {id: "fCover", type: "file", accept: "image/png,image/jpeg,image/webp,image/gif"});
  var shots = h("input", {id: "fShots", type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", multiple: true});
  var file = h("input", {id: "fFile", type: "file", accept: ".mcpack,.mcaddon,.mcworld,.mctemplate,.zip"});
  var msg = h("div", {class: "notice err", hidden: true});
  var bar = h("div", {class: "progress", hidden: true}, h("div"));
  var save = h("button", {class: "btn primary", type: "submit", text: edit ? "Guardar cambios" : "Publicar"});
  var form = h("form", {novalidate: true},
    h("div", {class: "row"}, field("Categoría", sel), field("Autor", author)),
    field("Título", title),
    h("div", {class: "row"}, field("Versión de Minecraft", mc), field("Versión del contenido", ver)),
    field("Descripción", desc),
    field("Etiquetas", tags, "Separadas por coma"),
    field("Archivo (.mcpack, .mcaddon, .mcworld, .zip)", file, (edit ? "Deja vacío para conservar el actual. " : "") + "Máximo " + fmtSize(MAX_FILE) + ". Para algo más grande usa el enlace externo."),
    field("Enlace externo (opcional)", link, "Mediafire, Drive, etc. Se muestra como descarga alterna."),
    h("div", {class: "row"}, field("Portada", cover), field("Capturas", shots)),
    msg, bar,
    h("div", {class: "actions"}, save, h("button", {class: "btn", type: "button", text: "Cancelar", onclick: function () { edit ? openDetail(edit.id) : closeSheet(); }})));
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    submitForm(edit, {type: sel.value, title: title.value.trim(), author: author.value.trim(), mc: mc.value.trim(), ver: ver.value.trim(),
      desc: desc.value.trim(), tags: tags.value, link: link.value.trim(), cover: cover.files[0], shots: Array.from(shots.files || []), file: file.files[0]}, msg, bar, save);
  });
  openSheet([h("h2", {text: edit ? "Editar publicación" : "Nueva publicación"}), form]);
}
async function upload(blob, name, type) {
  var path = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)) + "/" + slug(name);
  var r = await sb.storage.from(C.BUCKET).upload(path, blob, {contentType: type || blob.type || "application/octet-stream", upsert: false});
  if (r.error) throw r.error;
  return path;
}
async function submitForm(edit, v, msg, bar, btn) {
  msg.hidden = true;
  if (!v.title) return fail(msg, "Escribe un título.");
  if (v.link && !/^https?:\/\//i.test(v.link)) return fail(msg, "El enlace debe empezar con http:// o https://");
  if (!edit && !v.file && !v.link) return fail(msg, "Sube un archivo o pega un enlace de descarga.");
  if (v.file && v.file.size > MAX_FILE) return fail(msg, "El archivo pesa " + fmtSize(v.file.size) + ". El máximo es " + fmtSize(MAX_FILE) + ". Usa un enlace externo.");
  var imgs = (v.cover ? [v.cover] : []).concat(v.shots);
  for (var i = 0; i < imgs.length; i++) {
    if (!IMG_OK.test(imgs[i].type)) return fail(msg, "Las imágenes deben ser PNG, JPG, WEBP o GIF.");
    if (imgs[i].size > 10 * 1048576) return fail(msg, "Cada imagen debe pesar menos de 10 MB.");
  }
  btn.disabled = true; bar.hidden = false;
  var steps = (v.file ? 1 : 0) + imgs.length, done = 0, up = [];
  function tick() { done++; bar.firstChild.style.width = Math.round(done / Math.max(steps, 1) * 100) + "%"; }
  var old = edit || {};
  try {
    var rec = {type: v.type, title: v.title, author: v.author || null, mc_version: v.mc || null, version: v.ver || null,
      description: v.desc || null, link: v.link || null,
      tags: v.tags.split(",").map(function (s) { return s.trim().replace(/^#/, ""); }).filter(Boolean).slice(0, 10)};
    if (v.file) { btn.textContent = "Subiendo archivo…"; var fp = await upload(v.file, v.file.name, "application/octet-stream"); up.push(fp); tick(); rec.file_path = fp; rec.file_name = v.file.name; rec.file_size = v.file.size; }
    if (v.cover) { btn.textContent = "Subiendo portada…"; var cp = await upload(v.cover, v.cover.name); up.push(cp); tick(); rec.cover_path = cp; }
    if (v.shots.length) {
      var sp = [];
      for (var k = 0; k < v.shots.length; k++) { btn.textContent = "Subiendo captura " + (k + 1) + "/" + v.shots.length + "…"; var p1 = await upload(v.shots[k], v.shots[k].name); up.push(p1); sp.push(p1); tick(); }
      rec.screenshots = sp;
    }
    btn.textContent = "Guardando…";
    var r = edit ? await sb.from("posts").update(rec).eq("id", edit.id).select().single() : await sb.from("posts").insert(rec).select().single();
    if (r.error) throw r.error;
    var saved = r.data, gone = [];
    if (edit) {
      if (v.file && old.file_path) gone.push(old.file_path);
      if (v.cover && old.cover_path) gone.push(old.cover_path);
      if (v.shots.length && old.screenshots) gone = gone.concat(old.screenshots);
      if (gone.length) { try { await sb.storage.from(C.BUCKET).remove(gone); } catch (x) {} }
      S.posts = S.posts.map(function (x) { return x.id === saved.id ? saved : x; });
    } else S.posts.unshift(saved);
    render(); toast(edit ? "Cambios guardados" : "Publicado"); openDetail(saved.id);
  } catch (e) {
    if (up.length) { try { await sb.storage.from(C.BUCKET).remove(up); } catch (x) {} }
    fail(msg, "No se pudo guardar: " + (e.message || "error desconocido"));
    btn.disabled = false; btn.textContent = edit ? "Guardar cambios" : "Publicar"; bar.hidden = true;
  }
}

/* ---------- Acceso de administrador ---------- */
async function refreshAdmin() {
  if (!ADMIN_PAGE) return;
  var s = await sb.auth.getSession();
  S.user = s.data.session ? s.data.session.user : null;
  S.admin = false;
  if (S.user) { var r = await sb.rpc("is_admin"); S.admin = r.data === true; }
  try { var ex = await sb.rpc("admin_exists"); S.adminExists = ex.data !== false; } catch (e) {}
  render();
}
function openAuth() {
  var email = h("input", {id: "aEmail", type: "email", autocomplete: "email"});
  var pass = h("input", {id: "aPass", type: "password", autocomplete: "current-password", minlength: "6"});
  var msg = h("div", {class: "notice", hidden: true});
  function say(t, err) { msg.textContent = t; msg.className = "notice" + (err ? " err" : ""); msg.hidden = false; }
  var enter = h("button", {class: "btn primary", type: "submit", text: "Entrar"});
  var create = h("button", {class: "btn", type: "button", text: "Crear cuenta"});
  create.addEventListener("click", async function () {
    if (!email.value || pass.value.length < 6) return say("Escribe un correo y una contraseña de al menos 6 caracteres.", true);
    create.disabled = true;
    var r = await sb.auth.signUp({email: email.value.trim(), password: pass.value});
    create.disabled = false;
    if (r.error) return say(r.error.message, true);
    if (!r.data.session) say("Cuenta creada. Revisa tu correo para confirmarla y luego pulsa Entrar.");
    else { await refreshAdmin(); openAuth(); }
  });
  var form = h("form", {novalidate: true},
    h("p", {class: "auth-note", text: S.adminExists ? "Solo el administrador puede publicar. El resto de las personas puede ver y descargar sin cuenta." : "Aún no hay administrador. Crea tu cuenta, confírmala por correo, entra y pulsa Convertirme en administrador."}),
    field("Correo", email), field("Contraseña", pass), msg,
    h("div", {class: "actions"}, enter, create, h("button", {class: "btn grow", type: "button", text: "Cerrar", onclick: closeSheet})));
  form.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    enter.disabled = true;
    var r = await sb.auth.signInWithPassword({email: email.value.trim(), password: pass.value});
    enter.disabled = false;
    if (r.error) return say(r.error.message === "Invalid login credentials" ? "Correo o contraseña incorrectos." : r.error.message, true);
    await refreshAdmin();
    if (S.admin) { closeSheet(); toast("Sesión de administrador iniciada"); } else openAuth();
  });
  var parts = [h("h2", {text: "Administrador"})];
  if (S.user && !S.admin) {
    var claim = h("button", {class: "btn primary", type: "button", text: "Convertirme en administrador"});
    claim.addEventListener("click", async function () {
      var r = await sb.rpc("claim_admin");
      if (r.data === true) { await refreshAdmin(); closeSheet(); toast("Ahora eres administrador"); }
      else toast("Ya existe un administrador. Esta cuenta no tiene permiso para publicar.");
    });
    parts.push(h("p", {class: "auth-note", text: "Sesión iniciada como " + S.user.email + ", sin permisos de publicación."}),
      S.adminExists ? null : claim,
      h("div", {class: "actions"}, h("button", {class: "btn", type: "button", text: "Cerrar sesión", onclick: logout}), h("button", {class: "btn grow", type: "button", text: "Cerrar", onclick: closeSheet})));
  } else parts.push(form);
  openSheet(parts);
}
async function logout() { await sb.auth.signOut(); closeSheet(); await refreshAdmin(); toast("Sesión cerrada"); }

/* ---------- Inicio ---------- */
async function loadPosts() {
  var r = await sb.from("posts").select("*").order("created_at", {ascending: false});
  S.loaded = true;
  if (r.error) { $("status").textContent = ""; $("status").appendChild(h("div", {class: "notice err", text: "No se pudieron cargar las publicaciones: " + r.error.message})); }
  else { $("status").textContent = ""; S.posts = r.data || []; }
  render();
}
$("q").addEventListener("input", function (e) { S.q = e.target.value; render(); });
$("fVer").addEventListener("change", function (e) { S.ver = e.target.value; render(); });
$("fSort").addEventListener("change", function (e) { S.sort = e.target.value; render(); });
if (ADMIN_PAGE) {
  $("btnNew").addEventListener("click", function () { openForm(); });
  $("btnAuth").addEventListener("click", function () { if (S.admin) logout(); else openAuth(); });
}
render();
loadPosts();
refreshAdmin();
