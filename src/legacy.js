const ASSETS = {
  exterior: '/assets/hero-exterior-concept.png',
  room: '/assets/room-concept.png',
  common: '/assets/common-area-concept.png'
};

const rooms = Array.from({ length: 16 }, (_, index) => ({
  id: index + 1,
  name: `Habitación ${String(index + 1).padStart(2, '0')}`,
  type: index % 5 === 1 ? 'Familiar' : index % 3 === 0 ? 'Individual' : 'Doble',
  capacity: index % 5 === 1 ? 4 : index % 3 === 0 ? 1 : 2,
  image: index % 4 === 0 ? ASSETS.common : ASSETS.room,
  state: index === 5 ? 'Mantenimiento demo' : index === 8 ? 'No publicada demo' : 'Por verificar'
}));

const icon = (name) => ({
  wifi: '⌁', tv: '▣', bath: '◫', fan: '✣', solar: '☼', water: '◉'
}[name] || '•');

const footer = () => `
  <footer class="footer">
    <div class="footer-grid">
      <div>
        <a class="brand" href="#inicio" data-route="inicio">
          <svg class="brand-mark" viewBox="0 0 48 48" aria-hidden="true"><rect x="18" y="5" width="9" height="38" rx="4.5" fill="currentColor"/><path d="M12 17c7 0 10-4 11-10-7 0-11 3-11 10Zm15 11c7-1 11-5 12-12-8 0-12 4-12 12ZM8 32c7 0 11-3 13-10-8 0-12 3-13 10Z" fill="currentColor" opacity=".72"/><path d="M17 18h11M16 31h12" stroke="#26312B" stroke-width="2.2" stroke-linecap="round"/></svg>
          <span class="brand-copy"><strong>Hotel Bambú</strong><small>PLAZA · MOCOA</small></span>
        </a>
        <p style="max-width:320px;margin-top:20px">Una propuesta digital inspirada en la naturaleza, la calma y la hospitalidad de Mocoa.</p>
      </div>
      <div><h4>Explorar</h4><ul><li><a href="#habitaciones" data-route="habitaciones">Habitaciones</a></li><li><a href="#galeria" data-route="galeria">Galería</a></li><li><a href="#contacto" data-route="contacto">Contacto</a></li></ul></div>
      <div><h4>Información</h4><ul><li>Políticas · por configurar</li><li>Privacidad · borrador pendiente</li><li>Preguntas frecuentes</li></ul></div>
      <div><h4>Contacto</h4><ul><li>Mocoa, Putumayo</li><li>WhatsApp · por configurar</li><li>Horario · por configurar</li></ul></div>
    </div>
    <div class="footer-bottom"><span>© ${new Date().getFullYear()} Hotel Bambú Plaza</span><span>Prototipo · No procesa reservas reales</span></div>
  </footer>`;

const conceptLabel = '<span class="concept-label">Imagen conceptual · reemplazar por foto real</span>';

function homeView() {
  return `
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-slides">
        <div class="hero-slide active"><img src="${ASSETS.exterior}" alt="Concepto visual de una entrada de hotel tropical entre vegetación" fetchpriority="high" /></div>
        <div class="hero-slide"><img src="${ASSETS.room}" alt="Concepto visual de una habitación cálida con detalles naturales" /></div>
        <div class="hero-slide"><img src="${ASSETS.common}" alt="Concepto visual de un espacio común con bambú y vegetación" /></div>
      </div>
      ${conceptLabel}
      <div class="hero-content">
        <span class="eyebrow">Mocoa · Putumayo</span>
        <h1 id="hero-title">Descansa al ritmo de la naturaleza.</h1>
        <p class="hero-copy">Una estadía tranquila, sencilla y acogedora en el corazón del piedemonte amazónico.</p>
        <div class="hero-actions"><button class="button button-light" data-booking-open>Consultar estadía</button><a class="button button-ghost" style="color:white;border-color:rgba(255,255,255,.4)" href="#habitaciones" data-route="habitaciones">Ver habitaciones</a></div>
      </div>
      <div class="carousel-controls"><button class="icon-button" id="carousel-prev" aria-label="Imagen anterior">←</button><button class="icon-button" id="carousel-pause" aria-label="Pausar carrusel">Ⅱ</button><button class="icon-button" id="carousel-next" aria-label="Imagen siguiente">→</button></div>
      <div class="carousel-index"><strong id="carousel-current">01</strong> <span>/ 03</span></div>
    </section>
    <form class="search-bar" id="quick-search">
      <label>Entrada<input type="date" name="checkin" required /></label>
      <label>Salida<input type="date" name="checkout" required /></label>
      <label>Huéspedes<select name="guests"><option>1 huésped</option><option>2 huéspedes</option><option>3 huéspedes</option><option>4 huéspedes</option></select></label>
      <button class="button button-primary" type="submit">Consultar opciones</button>
    </form>
    <section class="section intro-grid">
      <div class="intro-copy"><span class="eyebrow">Bienvenido</span><h2>Hospitalidad serena, cerca de todo lo que hace único a Mocoa.</h2><p>Hotel Bambú Plaza propone una experiencia honesta y cómoda: habitaciones con baño privado, televisión por cable, ventilador y conexión WiFi en todos los pisos.</p><button class="button button-ghost" data-toast="La historia, misión y visión se editarán desde el CMS cuando el hotel las confirme.">Conocer nuestra historia</button></div>
      <div class="fact-stack"><div class="fact"><strong>16</strong><span>habitaciones gestionables individualmente</span></div><div class="fact"><strong>100%</strong><span>baño privado y WiFi en habitaciones</span></div><div class="fact"><strong>24/7</strong><span>reserva de agua para mayor continuidad</span></div></div>
    </section>
    <section class="section rooms-showcase">
      <div class="section-head"><div><span class="eyebrow" style="color:var(--sage)">Habitaciones</span><h2>Un espacio para bajar el ritmo.</h2><p>Elige según tu capacidad y necesidades. La tarifa y disponibilidad siempre se consultan con datos reales antes de confirmar.</p></div><a class="button button-light" href="#habitaciones" data-route="habitaciones">Ver las 16 habitaciones</a></div>
      <article class="room-feature">
        <div class="room-feature-image">${conceptLabel}<img src="${ASSETS.room}" alt="Concepto de habitación doble con baño privado y ventilador" loading="lazy" /></div>
        <div class="room-feature-copy"><span class="room-number">Habitación 01 · muestra</span><h3>Doble</h3><p>Un refugio luminoso para dos personas, con servicios esenciales y una atmósfera natural.</p><ul class="amenity-list"><li>2 huéspedes</li><li>Baño privado</li><li>WiFi</li><li>TV por cable</li><li>Ventilador</li></ul><p class="price-pending"><strong>Tarifa por noche pendiente.</strong><br>El administrador podrá configurarla antes de publicar.</p><div style="margin-top:22px;display:flex;gap:9px"><a class="button button-ghost" href="#habitacion-01" data-route="habitacion-01">Ver detalle</a><button class="button button-primary" data-booking-open data-room="Habitación 01 · Doble">Consultar</button></div></div>
      </article>
    </section>
    <section class="section">
      <div class="section-head"><span class="eyebrow">Lo esencial, bien cuidado</span><h2>Comodidades que acompañan tu descanso.</h2></div>
      <div class="amenities-grid">
        ${[['wifi','WiFi en habitaciones','Internet disponible en todos los pisos.'],['bath','Baño privado','Privacidad y comodidad en cada habitación.'],['tv','Televisión por cable','Televisor y señal de cable en cada habitación.'],['fan','Ventilador','Ventilación disponible en todas las habitaciones.']].map(a => `<article class="amenity-card"><span class="amenity-icon">${icon(a[0])}</span><div><h3>${a[1]}</h3><p>${a[2]}</p></div></article>`).join('')}
      </div>
    </section>
    <section class="sustainability"><div class="sustainability-panel"><div><span class="eyebrow">Compromiso consciente</span><h2>Energía que mira hacia el futuro.</h2><p>Los paneles solares forman parte de una operación más responsable. En la versión final, esta sección podrá ampliar las acciones verificadas del hotel sin hacer afirmaciones ambientales no sustentadas.</p></div><div class="sustainability-points"><div><b>${icon('solar')}</b><span><strong>Paneles solares</strong><br><small>Característica confirmada</small></span></div><div><b>${icon('water')}</b><span><strong>Reserva de agua</strong><br><small>Característica confirmada</small></span></div></div></div></section>
    <section class="section">
      <div class="section-head"><span class="eyebrow">Una mirada al hotel</span><h2>Espacios para sentirte a gusto.</h2><p>Estas imágenes son conceptuales y deben reemplazarse por fotografías reales antes del lanzamiento.</p></div>
      <div class="gallery-strip">${galleryTiles(4)}</div>
    </section>
    <section class="cta-panel"><div><span class="eyebrow" style="color:var(--sage)">Tu próxima estadía</span><h2>Cuéntanos cuándo vienes a Mocoa.</h2><p>Envía una solicitud breve. El equipo del hotel confirmará disponibilidad y tarifa personalmente.</p><button class="button button-light" data-booking-open>Iniciar solicitud</button></div></section>
    ${footer()}`;
}

function roomsView() {
  return `
    <section class="page-hero"><span class="eyebrow">16 habitaciones</span><h1>Encuentra tu espacio.</h1><p>Cada habitación tendrá su propia capacidad, tarifa, galería y disponibilidad real. En este prototipo todos los datos operativos se muestran como pendientes o demostrativos.</p></section>
    <div class="toolbar"><div class="filter-chips" role="group" aria-label="Filtrar habitaciones"><button class="chip active" data-filter="Todas">Todas</button><button class="chip" data-filter="Individual">Individual</button><button class="chip" data-filter="Doble">Doble</button><button class="chip" data-filter="Familiar">Familiar</button></div><span id="room-count">16 habitaciones</span></div>
    <section class="room-grid" id="room-grid">${roomCards(rooms)}</section>
    ${footer()}`;
}

function roomCards(list) {
  return list.map(room => `<article class="room-card" data-type="${room.type}"><div class="room-card-image">${conceptLabel}<img src="${room.image}" alt="Imagen conceptual de ${room.name}" loading="lazy"/><span class="status-pill">${room.state}</span></div><div class="room-card-copy"><small class="room-number">${room.name}</small><h3>${room.type}</h3><p>Configuración demostrativa · servicios confirmados del hotel.</p><div class="room-card-meta"><span>Hasta ${room.capacity}</span><span>Baño privado</span><span>WiFi</span></div><div class="room-card-actions"><a class="button button-ghost" href="#habitacion-${String(room.id).padStart(2,'0')}" data-route="habitacion-${String(room.id).padStart(2,'0')}">Ver detalle</a><button class="button button-primary" data-booking-open data-room="${room.name} · ${room.type}">Consultar</button></div></div></article>`).join('');
}

function roomDetailView(route) {
  const number = Number(route.split('-').pop()) || 1;
  const room = rooms[Math.min(Math.max(number - 1, 0), 15)];
  return `<section class="room-detail"><div class="detail-media">${conceptLabel}<img src="${room.image}" alt="Imagen conceptual de ${room.name}"/></div><article class="detail-content"><a href="#habitaciones" data-route="habitaciones" class="eyebrow">← Todas las habitaciones</a><small class="room-number">${room.name} · prototipo</small><h1>${room.type}</h1><p class="lead">Una descripción específica de esta habitación podrá redactarse y publicarse desde el panel administrativo.</p><div class="detail-block"><h3>Capacidad</h3><p>Hasta ${room.capacity} ${room.capacity === 1 ? 'huésped' : 'huéspedes'} · valor demostrativo</p></div><div class="detail-block"><h3>Servicios confirmados del hotel</h3><ul class="feature-list"><li>Baño privado</li><li>Televisor</li><li>Televisión por cable</li><li>Ventilador</li><li>WiFi</li><li>Internet en todos los pisos</li></ul></div><div class="detail-block"><h3>Tarifa</h3><p class="price-pending"><strong>Precio por noche pendiente de configuración.</strong><br>No se mostrará un valor hasta que el hotel lo registre.</p></div><div class="detail-block"><h3>Disponibilidad</h3><p>Se consultará en tiempo real contra reservas confirmadas, bloqueos y mantenimiento. Este prototipo no afirma disponibilidad.</p></div><button class="button button-primary" data-booking-open data-room="${room.name} · ${room.type}">Solicitar esta habitación</button></article></section>`;
}

function galleryTiles(count = 8) {
  const tiles = [
    [ASSETS.exterior, 'Fachada · concepto'], [ASSETS.room, 'Habitación · concepto'], [ASSETS.common, 'Espacios comunes · concepto'], [ASSETS.exterior, 'Entorno · concepto'], [ASSETS.room, 'Habitaciones · concepto'], [ASSETS.common, 'Instalaciones · concepto'], [ASSETS.exterior, 'Fachada · concepto'], [ASSETS.common, 'Espacios comunes · concepto']
  ];
  return tiles.slice(0, count).map(([src,label]) => `<button class="gallery-tile" type="button" data-lightbox="${src}" data-caption="${label}"><img src="${src}" alt="${label}" loading="lazy"/><span>${label}</span></button>`).join('');
}

function galleryView() {
  return `<section class="page-hero"><span class="eyebrow">Galería</span><h1>La calma, en imágenes.</h1><p>Propuesta de estructura visual por categorías. Todas las fotografías actuales son conceptuales y deberán reemplazarse antes de publicar el sitio definitivo.</p></section><div class="toolbar"><div class="filter-chips"><button class="chip active">Todas</button><button class="chip" data-toast="Filtro de categoría demostrado: Habitaciones">Habitaciones</button><button class="chip" data-toast="Filtro de categoría demostrado: Instalaciones">Instalaciones</button><button class="chip" data-toast="Filtro de categoría demostrado: Fachada">Fachada</button><button class="chip" data-toast="Filtro de categoría demostrado: Espacios comunes">Espacios comunes</button><button class="chip" data-toast="Filtro de categoría demostrado: Entorno">Entorno</button></div></div><section class="gallery-page"><div class="gallery-masonry">${galleryTiles(8)}</div></section>${footer()}`;
}

function contactView() {
  return `<section class="page-hero"><span class="eyebrow">Ubicación y contacto</span><h1>Estamos en Mocoa.</h1><p>Los datos de contacto permanecen deliberadamente sin publicar hasta que el hotel los confirme desde el panel administrativo.</p></section><section class="contact-grid"><article class="contact-card"><span class="eyebrow">Hablemos</span><h2>Tu estadía empieza con una conversación.</h2><div class="contact-list"><div class="contact-row"><span>Dirección</span><b class="pending">Por configurar</b></div><div class="contact-row"><span>WhatsApp</span><b class="pending">Por configurar</b></div><div class="contact-row"><span>Teléfono</span><b class="pending">Por configurar</b></div><div class="contact-row"><span>Correo</span><b class="pending">Por configurar</b></div><div class="contact-row"><span>Horario</span><b class="pending">Por configurar</b></div></div><button class="button button-primary" data-booking-open>Preparar solicitud</button></article><article class="map-card"><div class="map-placeholder"><span class="eyebrow" style="color:white">Mapa de referencia</span><h3 style="font-size:2rem;margin-bottom:8px">Mocoa, Putumayo</h3><p>El marcador exacto se activará al registrar la dirección oficial.</p><a class="button button-light" href="https://www.google.com/maps/search/Mocoa,+Putumayo" target="_blank" rel="noopener">Abrir Mocoa en Google Maps ↗</a></div></article></section>${footer()}`;
}

function adminShell(section = 'dashboard') {
  return `<section class="admin-layout"><aside class="admin-sidebar"><a class="brand" href="#inicio" data-route="inicio"><svg class="brand-mark" viewBox="0 0 48 48" aria-hidden="true"><rect x="18" y="5" width="9" height="38" rx="4.5" fill="currentColor"/><path d="M12 17c7 0 10-4 11-10-7 0-11 3-11 10Zm15 11c7-1 11-5 12-12-8 0-12 4-12 12ZM8 32c7 0 11-3 13-10-8 0-12 3-13 10Z" fill="currentColor" opacity=".72"/></svg><span class="brand-copy"><strong>Bambú Admin</strong><small>PLAZA · DEMO</small></span></a><nav class="admin-nav"><button class="${section==='dashboard'?'active':''}" data-admin="dashboard">⌂ Resumen</button><button class="${section==='rooms'?'active':''}" data-admin="rooms">▦ Habitaciones</button><button class="${section==='calendar'?'active':''}" data-admin="calendar">□ Calendario</button><button class="${section==='content'?'active':''}" data-admin="content">✎ Contenido</button><button data-toast="Módulo de usuarios previsto para la fase de backend.">♙ Usuarios y roles</button><button data-toast="La configuración operativa se implementará con persistencia PostgreSQL.">⚙ Configuración</button></nav><div class="admin-user"><strong>Administrador demo</strong><small>Sin autenticación en este prototipo</small></div></aside><main class="admin-main"><header class="admin-topbar"><h1>${{dashboard:'Resumen',rooms:'Gestión de habitaciones',calendar:'Calendario de reservas',content:'Editor de contenido'}[section]}</h1><div style="display:flex;gap:10px;align-items:center"><span class="demo-badge">MODO DEMO · DATOS LOCALES</span><a class="button button-ghost" href="#inicio" data-route="inicio">Ver sitio</a></div></header><div class="admin-content">${adminContent(section)}</div></main></section>`;
}

function adminContent(section) {
  if (section === 'rooms') return `<div class="admin-heading"><div><h2>16 habitaciones</h2><p>Edita cada habitación sin tocar código.</p></div><button class="button button-primary" data-toast="En producción, este botón abrirá el formulario de nueva habitación.">+ Crear habitación</button></div><div class="panel" style="overflow-x:auto"><table class="data-table"><thead><tr><th>Habitación</th><th>Tipo</th><th>Capacidad</th><th>Tarifa</th><th>Estado demo</th><th>Publicación</th><th></th></tr></thead><tbody>${rooms.map(r=>`<tr><td><div class="table-room"><img src="${r.image}" alt=""/><b>${r.name}</b></div></td><td>${r.type}</td><td>${r.capacity}</td><td class="pending">Sin configurar</td><td><span class="state ${r.id===6?'gold':''}">${r.id===6?'Mantenimiento':'Por verificar'}</span></td><td><span class="state ${r.id===9?'gray':''}">${r.id===9?'Borrador':'Visible demo'}</span></td><td><button class="button button-ghost" style="min-height:34px" data-toast="Editor de ${r.name} abierto en modo demostración.">Editar</button></td></tr>`).join('')}</tbody></table></div>`;
  if (section === 'calendar') return `<div class="admin-heading"><div><h2>Octubre 2026</h2><p>Vista semanal conceptual. No representa reservas reales.</p></div><div style="display:flex;gap:8px"><button class="button button-ghost" data-toast="Vista diaria seleccionada (demostración).">Día</button><button class="button button-dark">Semana</button><button class="button button-ghost" data-toast="Vista mensual seleccionada (demostración).">Mes</button></div></div><div class="panel" style="overflow-x:auto"><div class="calendar"><div class="cal-head">Habitación</div>${['Lun 19','Mar 20','Mié 21','Jue 22','Vie 23','Sáb 24','Dom 25'].map(d=>`<div class="cal-head">${d}</div>`).join('')}${[1,2,3,4,5].map((n,i)=>`<div class="cal-room">Hab. ${String(n).padStart(2,'0')}</div>${Array.from({length:7},(_,d)=>`<div>${(i===0&&d===1)?'<div class="reservation">Confirmada · demo</div>':(i===2&&d===4)?'<div class="reservation pending">Solicitud · demo</div>':(i===4&&d===2)?'<div class="reservation" style="background:#ececea">Bloqueo · demo</div>':''}</div>`).join('')}`).join('')}</div></div><div class="notice warning" style="margin-top:18px"><strong>Estados diferenciados</strong><p>Una solicitud pendiente nunca ocupa automáticamente la habitación. Solo una confirmación manual crea la reserva.</p></div>`;
  if (section === 'content') return `<div class="admin-heading"><div><h2>Contenido del sitio</h2><p>Cambios editables con vista previa antes de publicar.</p></div><button class="button button-primary" id="save-content">Guardar borrador</button></div><div class="editor-layout"><nav class="editor-nav"><button class="active">Inicio</button><button>Información del hotel</button><button>Servicios</button><button>Preguntas frecuentes</button><button>Contacto</button><button>Políticas</button></nav><form class="editor-form" id="content-form"><label class="editor-field">Título principal<input name="headline" value="Descansa al ritmo de la naturaleza."/></label><label class="editor-field">Mensaje de bienvenida<textarea name="intro">Una estadía tranquila, sencilla y acogedora en el corazón del piedemonte amazónico.</textarea></label><label class="editor-field">Carrusel principal<div class="upload-zone"><div><strong>Arrastra fotografías aquí</strong><br><small>JPG, PNG o WebP · validación y compresión en producción</small></div></div></label><label class="editor-field">Reproducción automática<select><option>Activada con pausa disponible</option><option>Desactivada</option></select></label><div class="notice"><strong>Control editorial</strong><p>Los cambios se guardarán como borrador y requerirán publicación explícita.</p></div></form></div>`;
  return `<div class="admin-heading"><div><h2>Buenos días</h2><p>Un vistazo operativo del hotel · cifras demostrativas.</p></div><button class="button button-primary" data-booking-open>Nueva solicitud demo</button></div><div class="stats-grid"><article class="stat-card"><span>Total de habitaciones</span><strong>16</strong><small>Capacidad física confirmada</small></article><article class="stat-card"><span>Disponibles ahora</span><strong>—</strong><small>Requiere datos reales</small></article><article class="stat-card"><span>Solicitudes pendientes</span><strong id="demo-requests">${getDemoRequests().length}</strong><small>Guardadas en este navegador</small></article><article class="stat-card"><span>Ingresos confirmados</span><strong>—</strong><small>Sin datos reales</small></article></div><div class="admin-grid"><article class="panel"><div class="panel-head"><h3>Ocupación por periodo · ejemplo visual</h3><span class="demo-badge">SIMULACIÓN</span></div><div class="occupancy-chart">${[35,48,42,67,51,72,61].map((h,i)=>`<div class="bar" style="height:${h}%"><span>${['L','M','X','J','V','S','D'][i]}</span></div>`).join('')}</div></article><aside class="panel"><div class="panel-head"><h3>Antes de publicar</h3></div><div class="task-list"><div class="task"><span class="task-dot"></span><div><b>Configurar WhatsApp</b><small>Bloquea el envío real</small></div></div><div class="task"><span class="task-dot"></span><div><b>Cargar tarifas</b><small>16 habitaciones</small></div></div><div class="task"><span class="task-dot"></span><div><b>Reemplazar fotografías</b><small>Activos conceptuales</small></div></div><div class="task"><span class="task-dot"></span><div><b>Completar contacto</b><small>Dirección y horario</small></div></div></div></aside></div>`;
}

function render(route = getRoute()) {
  clearInterval(carouselTimer);
  const app = document.querySelector('#app');
  const isAdmin = route.startsWith('admin');
  document.querySelector('.site-header').hidden = isAdmin;
  document.querySelector('.prototype-banner').hidden = isAdmin;
  document.querySelector('.whatsapp-fab').hidden = isAdmin;
  if (route === 'habitaciones') app.innerHTML = roomsView();
  else if (route.startsWith('habitacion-')) app.innerHTML = roomDetailView(route);
  else if (route === 'galeria') app.innerHTML = galleryView();
  else if (route === 'contacto') app.innerHTML = contactView();
  else if (isAdmin) app.innerHTML = adminShell(route.split('-')[1] || 'dashboard');
  else app.innerHTML = homeView();
  window.scrollTo(0, 0);
  bindViewEvents();
  updateNav(route);
}

function getRoute() { return location.hash.replace(/^#/, '') || 'inicio'; }
function navigate(route) { if (getRoute() === route) render(route); else location.hash = route; }
function updateNav(route) { document.querySelectorAll('[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === route)); }

let carouselTimer;
function setupCarousel() {
  const slides = [...document.querySelectorAll('.hero-slide')];
  if (!slides.length) return;
  let index = 0, playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const show = next => { index = (next + slides.length) % slides.length; slides.forEach((s,i)=>s.classList.toggle('active', i===index)); document.querySelector('#carousel-current').textContent = String(index+1).padStart(2,'0'); };
  const restart = () => { clearInterval(carouselTimer); if (playing) carouselTimer = setInterval(()=>show(index+1), 5500); };
  document.querySelector('#carousel-prev')?.addEventListener('click',()=>{show(index-1);restart();});
  document.querySelector('#carousel-next')?.addEventListener('click',()=>{show(index+1);restart();});
  document.querySelector('#carousel-pause')?.addEventListener('click',e=>{playing=!playing;e.currentTarget.textContent=playing?'Ⅱ':'▶';e.currentTarget.ariaLabel=playing?'Pausar carrusel':'Reproducir carrusel';restart();});
  const hero = document.querySelector('.hero'); let startX=0;
  hero?.addEventListener('touchstart', e=>startX=e.changedTouches[0].clientX,{passive:true});
  hero?.addEventListener('touchend', e=>{const dx=e.changedTouches[0].clientX-startX;if(Math.abs(dx)>45){show(index+(dx<0?1:-1));restart();}},{passive:true});
  restart();
}

function bindViewEvents() {
  document.querySelectorAll('[data-route]').forEach(el => el.addEventListener('click', e => { e.preventDefault(); navigate(el.dataset.route); closeMobileMenu(); }));
  document.querySelectorAll('[data-booking-open]').forEach(el => el.addEventListener('click', () => openBooking(el.dataset.room)));
  document.querySelectorAll('[data-toast]').forEach(el => el.addEventListener('click', () => showToast(el.dataset.toast)));
  document.querySelectorAll('[data-lightbox]').forEach(el => el.addEventListener('click',()=>openLightbox(el.dataset.lightbox,el.dataset.caption)));
  document.querySelectorAll('[data-admin]').forEach(el => el.addEventListener('click',()=>navigate(`admin-${el.dataset.admin}`)));
  document.querySelectorAll('[data-filter]').forEach(el => el.addEventListener('click',()=>filterRooms(el.dataset.filter,el)));
  document.querySelector('#quick-search')?.addEventListener('submit', quickSearch);
  document.querySelector('#save-content')?.addEventListener('click',()=>showToast('Borrador guardado localmente · demostración'));
  setupCarousel(); setMinimumDates();
}

function filterRooms(filter, button) {
  document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b===button));
  let shown=0; document.querySelectorAll('.room-card').forEach(card=>{const visible=filter==='Todas'||card.dataset.type===filter;card.hidden=!visible;if(visible)shown++;});
  document.querySelector('#room-count').textContent=`${shown} ${shown===1?'habitación':'habitaciones'}`;
}

function quickSearch(event) {
  event.preventDefault(); const data=new FormData(event.currentTarget); const result=validateDates(data.get('checkin'),data.get('checkout'));
  if(result.error) return showToast(result.error);
  openBooking(); const form=document.querySelector('#booking-form'); form.elements.checkin.value=data.get('checkin'); form.elements.checkout.value=data.get('checkout'); form.elements.guests.selectedIndex=event.currentTarget.elements.guests.selectedIndex;
}

function setMinimumDates() {
  const today = new Date(); today.setMinutes(today.getMinutes()-today.getTimezoneOffset()); const iso=today.toISOString().split('T')[0];
  document.querySelectorAll('input[type="date"]').forEach(input=>input.min=iso);
}

let bookingStep = 1;
function openBooking(room) {
  const shell=document.querySelector('#booking-shell'); shell.hidden=false; document.body.style.overflow='hidden'; bookingStep=1; showBookingStep();
  const form=document.querySelector('#booking-form'); if(room) form.elements.room.value=room;
  setTimeout(()=>document.querySelector('.booking-drawer input, .booking-drawer select')?.focus(),50);
}
function closeBooking() { document.querySelector('#booking-shell').hidden=true; document.body.style.overflow=''; }
function showBookingStep() {
  document.querySelectorAll('.booking-step').forEach(s=>s.classList.toggle('active',Number(s.dataset.step)===bookingStep));
  document.querySelectorAll('.stepper span').forEach((s,i)=>s.classList.toggle('active',i<bookingStep));
  document.querySelector('#booking-prev').hidden=bookingStep===1; document.querySelector('#booking-next').hidden=bookingStep===3; document.querySelector('#booking-submit').hidden=bookingStep!==3;
  document.querySelector('#booking-error').textContent=''; if(bookingStep===3) buildSummary();
}
function validateDates(checkin, checkout) {
  if(!checkin||!checkout) return {error:'Selecciona las fechas de entrada y salida.'};
  const start=new Date(`${checkin}T12:00:00`), end=new Date(`${checkout}T12:00:00`); const today=new Date(); today.setHours(0,0,0,0);
  if(start<today) return {error:'La fecha de entrada no puede estar en el pasado.'};
  if(end<=start) return {error:'La salida debe ser posterior a la entrada.'};
  return {nights:Math.round((end-start)/86400000)};
}
function validateStep() {
  const form=document.querySelector('#booking-form'); let message='';
  if(bookingStep===1){
    const dates=validateDates(form.elements.checkin.value,form.elements.checkout.value);
    const selectedRoom=rooms.find(room=>`${room.name} · ${room.type}`===form.elements.room.value);
    const guests=Number(form.elements.guests.value);
    if(!selectedRoom) message='Selecciona una habitación.';
    else if(guests>selectedRoom.capacity) message=`${selectedRoom.name} admite máximo ${selectedRoom.capacity} ${selectedRoom.capacity===1?'huésped':'huéspedes'}.`;
    else if(dates.error) message=dates.error;
  }
  if(bookingStep===2){if(!form.elements.guestName.value.trim())message='Ingresa tu nombre.';else if(!form.elements.phone.value.trim())message='Ingresa un teléfono de contacto.';else if(!form.elements.consent.checked)message='Debes aceptar el tratamiento de datos para guardar la solicitud.';}
  document.querySelector('#booking-error').textContent=message; return !message;
}
function buildSummary() {
  const form=document.querySelector('#booking-form'), data=new FormData(form), dates=validateDates(data.get('checkin'),data.get('checkout'));
  document.querySelector('#booking-summary').innerHTML=`<dl><dt>Habitación</dt><dd>${escapeHtml(data.get('room'))}</dd><dt>Entrada</dt><dd>${formatDate(data.get('checkin'))}</dd><dt>Salida</dt><dd>${formatDate(data.get('checkout'))}</dd><dt>Noches</dt><dd>${dates.nights}</dd><dt>Huéspedes</dt><dd>${data.get('guests')}</dd><dt>Valor estimado</dt><dd>Tarifa pendiente de configuración</dd><dt>Nombre</dt><dd>${escapeHtml(data.get('guestName'))}</dd><dt>Estado</dt><dd>Solicitud pendiente</dd></dl>`;
}
function saveDemoRequest(event) {
  event.preventDefault(); const form=event.currentTarget, data=Object.fromEntries(new FormData(form)); const dates=validateDates(data.checkin,data.checkout);
  const record={id:crypto.randomUUID?.()||String(Date.now()),...data,nights:dates.nights,status:'PENDIENTE_DEMO',createdAt:new Date().toISOString()}; const list=getDemoRequests();list.push(record);localStorage.setItem('bambu-demo-requests',JSON.stringify(list));
  closeBooking(); form.reset(); showToast('Solicitud demo guardada en este navegador. No se envió a WhatsApp.');
}
function getDemoRequests(){try{return JSON.parse(localStorage.getItem('bambu-demo-requests')||'[]');}catch{return[];}}
function formatDate(value){return new Intl.DateTimeFormat('es-CO',{day:'numeric',month:'long',year:'numeric'}).format(new Date(`${value}T12:00:00`));}
function escapeHtml(value=''){const div=document.createElement('div');div.textContent=value;return div.innerHTML;}

function openLightbox(src,caption){document.querySelector('#lightbox-image').src=src;document.querySelector('#lightbox-image').alt=caption;document.querySelector('#lightbox-caption').textContent=caption;document.querySelector('#lightbox').hidden=false;document.body.style.overflow='hidden';}
function closeLightbox(){document.querySelector('#lightbox').hidden=true;document.body.style.overflow='';}
let toastTimer; function showToast(message){const toast=document.querySelector('#toast');toast.textContent=message;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),3500);}
function closeMobileMenu(){const menu=document.querySelector('#mobile-menu'),button=document.querySelector('#menu-button');menu.hidden=true;button.ariaExpanded='false';}

document.querySelector('#menu-button').addEventListener('click',e=>{const menu=document.querySelector('#mobile-menu');menu.hidden=!menu.hidden;e.currentTarget.ariaExpanded=String(!menu.hidden);});
document.querySelector('#whatsapp-fab').addEventListener('click',()=>showToast('El número de WhatsApp aún no está configurado. No se abrirá un contacto ficticio.'));
document.querySelectorAll('[data-booking-close]').forEach(el=>el.addEventListener('click',closeBooking));
document.querySelector('#booking-next').addEventListener('click',()=>{if(validateStep()){bookingStep++;showBookingStep();}});
document.querySelector('#booking-prev').addEventListener('click',()=>{bookingStep--;showBookingStep();});
document.querySelector('#booking-form').addEventListener('submit',saveDemoRequest);
document.querySelectorAll('[data-lightbox-close]').forEach(el=>el.addEventListener('click',closeLightbox));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!document.querySelector('#booking-shell').hidden)closeBooking();if(!document.querySelector('#lightbox').hidden)closeLightbox();}});
window.addEventListener('hashchange',()=>render());

function populateBookingRooms(){
  const select=document.querySelector('#booking-form select[name="room"]');
  select.innerHTML='<option value="">Selecciona una habitación</option>'+rooms.map(room=>`<option value="${room.name} · ${room.type}">${room.name} · ${room.type} · hasta ${room.capacity}</option>`).join('');
}

export function initializeHotelApp() {
  populateBookingRooms();
  render();
}
