(function (global) {
  const STORAGE_KEY = 'dqops-language';
  const SUPPORTED_LANGUAGES = ['en', 'es'];
  const spanish = {
    'QR checkpoints': 'Puntos de control QR',
    'Require a QR checkpoint scan': 'Requerir escaneo de punto QR',
    'QR checkpoint (optional)': 'Punto de control QR (opcional)',
    'No QR scan required': 'No se requiere escaneo QR',
    'Create checkpoint': 'Crear punto de control',
    'Checkpoint name': 'Nombre del punto de control',
    'Area or instructions': 'Área o instrucciones',
    'Daily visit target (optional)': 'Meta de visitas diarias (opcional)',
    'Print QR': 'Imprimir QR',
    'Edit': 'Editar',
    'Deactivate': 'Desactivar',
    'Checkpoint scan log': 'Registro de escaneos del punto de control',
    'Log date': 'Fecha del registro',
    'No checkpoint scans were recorded for the selected date.': 'No se registraron escaneos en la fecha seleccionada.',
    'No QR checkpoints have been created yet.': 'Todavía no se han creado puntos de control QR.',
    'Scan a checkpoint': 'Escanear un punto de control',
    'Scan QR checkpoint': 'Escanear punto de control QR',
    'PHYSICAL CHECKPOINT': 'PUNTO DE CONTROL FÍSICO',
    'Point the camera at the printed DQ OPS checkpoint code.': 'Apunte la cámara al código impreso de DQ OPS.',
    'Camera is not started.': 'La cámara no se ha iniciado.',
    'Start camera': 'Iniciar cámara',
    'Camera scan not available?': '¿No está disponible el escaneo con cámara?',
    'Checkpoint link or code': 'Enlace o código del punto de control',
    'Record scan': 'Registrar escaneo',
    'Notices': 'Avisos',
    'OPERATIONS PLATFORM': 'PLATAFORMA DE OPERACIONES',
    'Dashboard': 'Panel',
    'Customize dashboard': 'Personalizar panel',
    'Time period': 'Periodo',
    'Current day': 'Día actual',
    'Current week': 'Semana actual',
    'Current month': 'Mes actual',
    'Location': 'Ubicación',
    'All locations': 'Todas las ubicaciones',
    'DAY / WEEK / MONTH AT A GLANCE': 'RESUMEN DEL DÍA / SEMANA / MES',
    'Sales & labor': 'Ventas y mano de obra',
    'Manager access': 'Acceso de gerencia',
    'Financial performance is available to Managers and above.': 'El desempeño financiero está disponible para gerentes y niveles superiores.',
    'ALERTS': 'ALERTAS',
    'Upcoming visits and events': 'Próximas visitas y eventos',
    'Open calendar': 'Abrir calendario',
    'No manually scheduled visits or inspection alerts yet.': 'Todavía no hay visitas programadas manualmente ni alertas de inspección.',
    'NEXT 15 DAYS': 'PRÓXIMOS 15 DÍAS',
    'Upcoming maintenance + FPC tasks': 'Próximo mantenimiento + tareas FPC',
    'Area Managers and above can move urgent items higher on this list.': 'Los gerentes de área y niveles superiores pueden subir los artículos urgentes en esta lista.',
    'No maintenance, PM, or FPC tasks due in the next 15 days.': 'No hay tareas de mantenimiento, mantenimiento preventivo ni FPC pendientes en los próximos 15 días.',
    'NOW + NEXT 30 DAYS': 'AHORA + PRÓXIMOS 30 DÍAS',
    'POP & readerboard updates': 'Actualizaciones de POP y letrero digital',
    'No POP or readerboard changes are due now or in the next 30 days.': 'No hay cambios de POP ni del letrero digital pendientes ahora o en los próximos 30 días.',
    'MANAGEMENT': 'GERENCIA',
    'Incident Reports': 'Informes de incidentes',
    'open authorized reports': 'informes autorizados abiertos',
    'Open Incident Reports': 'Abrir informes de incidentes',
    'DAILY OPS': 'OPERACIONES DIARIAS',
    'Task Lists': 'Listas de tareas',
    'CLEANING': 'LIMPIEZA',
    'Weekly Cleaning': 'Limpieza semanal',
    'FOOD SAFETY': 'SEGURIDAD ALIMENTARIA',
    'Temp Logs': 'Registros de temperatura',
    'MAINTENANCE': 'MANTENIMIENTO',
    'Work orders': 'Órdenes de trabajo',
    'Repair items': 'Artículos de reparación',
    'completed': 'completadas',
    'remaining': 'pendientes',
    'in progress': 'en curso',
    'open / in progress': 'abiertos / en curso',
    'Daily task-list progress.': 'Progreso de la lista diaria.',
    'Weekly cleaning-list progress.': 'Progreso de la lista de limpieza semanal.',
    'Required temperature-log progress.': 'Progreso de los registros de temperatura requeridos.',
    'Completed vs open/in-progress maintenance tasks.': 'Tareas de mantenimiento completadas comparadas con las abiertas o en curso.',
    'Completed vs open FPC repair items.': 'Artículos de reparación FPC completados comparados con los abiertos.',
    'Current day task-list progress.': 'Progreso de las listas de tareas del día actual.',
    'Current day weekly-cleaning progress.': 'Progreso de la limpieza semanal del día actual.',
    'Current day required temperature logs.': 'Registros de temperatura requeridos del día actual.',
    'Current day completed vs open work orders.': 'Órdenes de trabajo completadas comparadas con las abiertas del día actual.',
    'Current FPC repair item completion for the selected location view.': 'Avance actual de los artículos de reparación FPC para las ubicaciones seleccionadas.',
    'PROGRESS DETAIL': 'DETALLE DEL PROGRESO',
    'Location progress': 'Progreso de la ubicación',
    'Checklist + temp log progress': 'Progreso de listas y registros de temperatura',
    'No progress data available for this selection yet.': 'Todavía no hay datos de progreso para esta selección.',
    'Menu': 'Menú',
    'Maintenance': 'Mantenimiento',
    'Location Health': 'Estado de la ubicación',
    'Work Log': 'Registro de trabajo',
    'Resources': 'Recursos',
    'Smallwares': 'Artículos pequeños',
    'Incidents': 'Incidentes',
    'Store Inspections': 'Inspecciones de tienda',
    'Receipts': 'Recibos',
    'Help': 'Ayuda',
    'Users, tablets, and alerts': 'Usuarios, tabletas y alertas',
    'Add each person with the correct role and assigned locations. Employees use a four-digit PIN on a tablet locked to their store; managers use email and password. Alert rules can monitor overdue checklists or temperature logs and send email or opted-in text notifications.': 'Agregue a cada persona con la función y las ubicaciones asignadas correctas. Los empleados usan un PIN de cuatro dígitos en una tableta asignada a su tienda; los gerentes usan correo electrónico y contraseña. Las reglas de alerta pueden vigilar listas o registros de temperatura atrasados y enviar correos electrónicos o mensajes de texto autorizados.',
    'English / Español:': 'English / Español:',
    'Use the globe button on the sign-in screen, or open your name at the bottom of the side menu and choose the language. The interface choice is remembered on that device. Checklist names, FPC items, notices, and other organization-entered content remain in the language in which they were written.': 'Use el botón del globo en la pantalla de inicio de sesión, o abra su nombre en la parte inferior del menú lateral y elija el idioma. La selección de idioma se recuerda en ese dispositivo. Los nombres de las listas, los artículos FPC, los avisos y otro contenido ingresado por la organización permanecen en el idioma en que fueron escritos.',
    'Only assign access a person needs. Text messages require the user’s separate voluntary SMS opt-in.': 'Asigne solamente el acceso que la persona necesita. Los mensajes de texto requieren el consentimiento voluntario separado del usuario para SMS.',
    'Open the SMS opt-in form': 'Abrir el formulario de consentimiento para SMS',
    'Each person must enter the same mobile number saved in their HIS OPS user profile, check the consent box, and save their preference.': 'Cada persona debe ingresar el mismo número móvil guardado en su perfil de HIS OPS, marcar la casilla de consentimiento y guardar su preferencia.',
    'Back to contents': 'Volver al contenido',
    'Manage': 'Administración',
    'Platform Admin': 'Administración de plataforma',
    'Calendar': 'Calendario',
    'Daily operations': 'Operaciones diarias',
    'Current user': 'Usuario actual',
    'role': 'función',
    'Organization': 'Organización',
    'SMS opt-in': 'Consentimiento para SMS',
    'Send feedback': 'Enviar comentarios',
    'Change password': 'Cambiar contraseña',
    'Sign out': 'Cerrar sesión',
    'Temps': 'Temperaturas',
    'Maint.': 'Mantenimiento',
    'Health': 'Estado',
    'Items': 'Artículos',
    'Home': 'Inicio',
    'Tasks': 'Tareas',
    'Open navigation': 'Abrir navegación',
    'Expand navigation': 'Ampliar navegación',
    'Collapse navigation': 'Contraer navegación',
    'Close menu': 'Cerrar menú',
    'Log temperature': 'Registrar temperatura',
    'Area': 'Área',
    'Product / item': 'Producto / artículo',
    'Additional product / item': 'Producto / artículo adicional',
    'Enter a non-listed product or item': 'Ingrese un producto o artículo no listado',
    'Temperature (°F)': 'Temperatura (°F)',
    '− Negative': '− Negativa',
    'Recorded with the selected user and current time.': 'Se registrará con el usuario seleccionado y la hora actual.',
    'OK': 'Aceptar',
    'Add required photo': 'Agregar foto requerida',
    'Take or choose photo': 'Tomar o elegir una foto',
    'Photo preview': 'Vista previa de la foto',
    'Use this photo': 'Usar esta foto',
    'Who is using this device?': '¿Quién está usando este dispositivo?',
    'This tags new temperature readings, photos, and completions with the selected person.': 'Esto identifica las nuevas temperaturas, fotos y tareas completadas con la persona seleccionada.',
    'Temperature checks': 'Controles de temperatura',
    'Two readings required for every listed item': 'Se requieren dos lecturas para cada artículo listado',
    '+ Other Temp': '+ Otra temperatura',
    '📷 Report an issue': '📷 Reportar un problema',
    'Opening checklist': 'Lista de apertura',
    'Complete daily checklist': 'Completar lista diaria',
    'Temps complete': 'Temperaturas completas',
    'Temps due': 'Temperaturas pendientes',
    'Completed today': 'Completado hoy',
    'Checklist in progress': 'Lista en curso',
    'No temperatures recorded yet.': 'Todavía no se han registrado temperaturas.',
    'Other temperature': 'Otra temperatura',
    'Report an issue': 'Reportar un problema',
    'Issue description': 'Descripción del problema',
    'Add a note about the issue': 'Agregue una nota sobre el problema',
    'Attach photo': 'Adjuntar foto',
    'Save issue': 'Guardar problema',
    'Cancel': 'Cancelar',
    'Save': 'Guardar',
    'Edit': 'Editar',
    'Delete': 'Eliminar',
    'Remove': 'Quitar',
    'Close': 'Cerrar',
    'Open': 'Abrir',
    'Refresh': 'Actualizar',
    'Refresh devices': 'Actualizar dispositivos',
    'Status': 'Estado',
    'Name': 'Nombre',
    'Email': 'Correo electrónico',
    'Password': 'Contraseña',
    'Phone': 'Teléfono',
    'Role': 'Función',
    'Home location': 'Ubicación principal',
    'Assigned locations': 'Ubicaciones asignadas',
    'Select every store where this person may work or view information. The home location is always included.': 'Seleccione cada tienda donde esta persona pueda trabajar o ver información. La ubicación principal siempre está incluida.',
    'Locations included': 'Ubicaciones incluidas',
    'Select the locations to include in these alerts and reports.': 'Seleccione las ubicaciones que desea incluir en estas alertas e informes.',
    'Exactly four digits. The same PIN works on tablets at every assigned location.': 'Exactamente cuatro dígitos. El mismo PIN funciona en las tabletas de cada ubicación asignada.',
    'Employee': 'Empleado',
    'Shift Manager': 'Gerente de turno',
    'Manager': 'Gerente',
    'Area Manager': 'Gerente de área',
    'Director Of Operations': 'Director de operaciones',
    'Owner': 'Propietario',
    'Date': 'Fecha',
    'Time': 'Hora',
    'Notes': 'Notas',
    'New': 'Nuevo',
    'Assigned': 'Asignado',
    'In Progress': 'En curso',
    'Completed': 'Completado',
    'Declined': 'Rechazado',
    'Reviewing': 'En revisión',
    'Planned': 'Planificado',
    'Open work orders': 'Órdenes de trabajo abiertas',
    'No open work orders.': 'No hay órdenes de trabajo abiertas.',
    'Add work order': 'Agregar orden de trabajo',
    'Create work order': 'Crear orden de trabajo',
    'Equipment': 'Equipo',
    'Priority': 'Prioridad',
    'Category': 'Categoría',
    'Target date': 'Fecha objetivo',
    'Service manual / document': 'Manual de servicio / documento',
    'CONNECTED LOCATIONS': 'UBICACIONES CONECTADAS',
    'Thermostats': 'Termostatos',
    'UniFi Protect cameras': 'Cámaras UniFi Protect',
    'Loading thermostat status…': 'Cargando el estado de los termostatos…',
    'Loading camera status…': 'Cargando el estado de las cámaras…',
    'COMMUNICATIONS': 'COMUNICACIONES',
    'Previous notifications': 'Avisos anteriores',
    'ALERTS + CALENDAR': 'ALERTAS + CALENDARIO',
    'Group calendar': 'Calendario del grupo',
    'Add calendar event': 'Agregar evento al calendario',
    'Event title': 'Título del evento',
    'Event type': 'Tipo de evento',
    'Save event': 'Guardar evento',
    'Cancel edit': 'Cancelar edición',
    'Upcoming alerts': 'Próximas alertas',
    'View': 'Ver',
    'RECORDS': 'REGISTROS',
    'Checklist history': 'Historial de listas',
    'Temperature compliance history': 'Historial de cumplimiento de temperaturas',
    'Every calendar day appears, including days when no temperatures were recorded.': 'Se muestra cada día calendario, incluso los días sin temperaturas registradas.',
    'Export temperature report': 'Exportar informe de temperaturas',
    'Start date': 'Fecha inicial',
    'End date': 'Fecha final',
    'Show report': 'Mostrar informe',
    'Export reports': 'Exportar informes',
    'This location': 'Esta ubicación',
    'Export selected': 'Exportar seleccionados',
    'Export all': 'Exportar todo',
    'Management sign in': 'Inicio de sesión para gerencia',
    'Sign in with the email and password provided by your manager.': 'Inicie sesión con el correo electrónico y la contraseña proporcionados por su gerente.',
    'Password or temporary password': 'Contraseña o contraseña temporal',
    'Sign in': 'Iniciar sesión',
    'Signing in…': 'Iniciando sesión…',
    'Set up a store tablet': 'Configurar una tableta de tienda',
    'Employee PIN sign-in works only on a tablet enrolled to a store.': 'El inicio con PIN de empleado solo funciona en una tableta asignada a una tienda.',
    'Store tablet': 'Tableta de tienda',
    'Select your name and enter your four-digit PIN.': 'Seleccione su nombre e ingrese su PIN de cuatro dígitos.',
    'Your name': 'Su nombre',
    '4-digit PIN': 'PIN de 4 dígitos',
    'Start shift': 'Iniciar turno',
    'No employees at this store have a PIN yet. Ask a manager to add one.': 'Ningún empleado de esta tienda tiene un PIN todavía. Pida a un gerente que agregue uno.',
    'Manager sign in': 'Inicio de sesión de gerente',
    "Change this tablet's store": 'Cambiar la tienda de esta tableta',
    'Enter your four-digit PIN.': 'Ingrese su PIN de cuatro dígitos.',
    'Set up this store tablet': 'Configurar esta tableta de tienda',
    'Enter the setup code generated by a manager in DQ OPS.': 'Ingrese el código de configuración generado por un gerente en DQ OPS.',
    'Setup code': 'Código de configuración',
    '8-character code': 'Código de 8 caracteres',
    'Connect tablet': 'Conectar tableta',
    'Back to manager sign in': 'Volver al inicio de gerente',
    'Enter your email and password.': 'Ingrese su correo electrónico y contraseña.',
    'Choose a new password': 'Elija una contraseña nueva',
    'Enter a new password with at least eight characters.': 'Ingrese una contraseña nueva de al menos ocho caracteres.',
    'New password': 'Contraseña nueva',
    'Confirm password': 'Confirmar contraseña',
    'Save new password': 'Guardar contraseña nueva',
    'Use at least eight characters.': 'Use al menos ocho caracteres.',
    'The passwords do not match.': 'Las contraseñas no coinciden.',
    'Saving…': 'Guardando…',
    'Send app feedback': 'Enviar comentarios sobre la aplicación',
    'Idea': 'Idea',
    'Problem': 'Problema',
    'Question': 'Pregunta',
    'Other': 'Otro',
    'Title': 'Título',
    'Message': 'Mensaje',
    'Send': 'Enviar',
    'Thank you—your feedback was sent': 'Gracias; sus comentarios fueron enviados',
    'A new DQ OPS version is ready.': 'Hay una nueva versión de DQ OPS disponible.',
    'Refresh to use the latest features and fixes.': 'Actualice para usar las funciones y correcciones más recientes.',
    'Refresh now': 'Actualizar ahora'
  };

  const ignoredContentSelector = [
    '[data-i18n-ignore]',
    '#fpcList',
    '#noticeList',
    '#previousNoticeList',
    '#resourceList',
    '#historyList',
    '#calendarEventList',
    '.task-name'
  ].join(',');

  function getLanguage() {
    try {
      const saved = global.localStorage?.getItem(STORAGE_KEY);
      return SUPPORTED_LANGUAGES.includes(saved) ? saved : 'en';
    } catch {
      return 'en';
    }
  }

  function translatePatterns(value) {
    const patterns = [
      [/^Good morning, (.+)$/i, 'Buenos días, $1'],
      [/^Good afternoon, (.+)$/i, 'Buenas tardes, $1'],
      [/^Good evening, (.+)$/i, 'Buenas noches, $1'],
      [/^(\d+) of (\d+) done$/i, '$1 de $2 completadas'],
      [/^(\d+) remaining in this list$/i, '$1 pendientes en esta lista'],
      [/^(\d+) completed$/i, '$1 completadas'],
      [/^(\d+) remaining$/i, '$1 pendientes'],
      [/^(\d+) in progress$/i, '$1 en curso'],
      [/^(\d+) tasks?$/i, '$1 tareas'],
      [/^(\d+) updates?$/i, '$1 actualizaciones'],
      [/^(\d+) active$/i, '$1 activas'],
      [/^(\d+) rows?$/i, '$1 filas'],
      [/^(\d+) open$/i, '$1 abiertos'],
      [/^(\d+) completed · (\d+) remaining · (\d+) total$/i, '$1 completadas · $2 pendientes · $3 en total'],
      [/^Show (\d+) more upcoming items?$/i, 'Mostrar $1 elementos próximos más'],
      [/^Current day (.+) progress\.$/i, 'Progreso diario de $1.'],
      [/^Current week (.+) progress\.$/i, 'Progreso semanal de $1.'],
      [/^Current month (.+) progress\.$/i, 'Progreso mensual de $1.']
    ];
    for (const [pattern, replacement] of patterns) {
      if (pattern.test(value)) return value.replace(pattern, replacement);
    }
    return value;
  }

  function translate(value, language = getLanguage()) {
    if (language !== 'es' || value === null || value === undefined) return String(value ?? '');
    const source = String(value);
    const trimmed = source.trim();
    if (!trimmed) return source;
    const translated = spanish[trimmed] || translatePatterns(trimmed);
    if (translated === trimmed) return source;
    return source.replace(trimmed, translated);
  }

  function shouldIgnore(element) {
    if (!element || !element.closest) return false;
    if (element.closest('script,style,noscript,[translate="no"],input,textarea')) return true;
    if (element.closest(ignoredContentSelector)) return true;
    const option = element.closest('option');
    return Boolean(option && !option.hasAttribute('value'));
  }

  function translateElementAttributes(element) {
    if (!element?.getAttribute || shouldIgnore(element)) return;
    ['placeholder', 'title', 'aria-label'].forEach(attribute => {
      if (!element.hasAttribute(attribute)) return;
      const current = element.getAttribute(attribute);
      const translated = translate(current, 'es');
      if (translated !== current) element.setAttribute(attribute, translated);
    });
  }

  function translateTextNode(node) {
    if (!node?.parentElement || shouldIgnore(node.parentElement)) return;
    const translated = translate(node.nodeValue, 'es');
    if (translated !== node.nodeValue) node.nodeValue = translated;
  }

  function updateLanguageControls() {
    if (typeof document === 'undefined') return;
    const language = getLanguage();
    document.documentElement.lang = language;
    document.querySelectorAll('[data-language-label]').forEach(label => {
      const nextLabel = language === 'es' ? 'English' : 'Español';
      if (label.textContent !== nextLabel) label.textContent = nextLabel;
    });
    document.querySelectorAll('[data-language-toggle]').forEach(button => {
      const nextTitle = language === 'es' ? 'Switch to English' : 'Cambiar a español';
      if (button.getAttribute('aria-label') !== nextTitle) button.setAttribute('aria-label', nextTitle);
      if (button.getAttribute('title') !== nextTitle) button.setAttribute('title', nextTitle);
    });
  }

  function apply(root = typeof document !== 'undefined' ? document : null) {
    if (!root || typeof document === 'undefined') return;
    updateLanguageControls();
    if (getLanguage() !== 'es') return;
    if (root.nodeType === 3) return translateTextNode(root);
    if (root.nodeType === 1) translateElementAttributes(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === 3) translateTextNode(node);
      else translateElementAttributes(node);
    }
    updateLanguageControls();
  }

  function setLanguage(language) {
    const next = SUPPORTED_LANGUAGES.includes(language) ? language : 'en';
    try { global.localStorage?.setItem(STORAGE_KEY, next); } catch {}
    return next;
  }

  function toggleLanguage() {
    setLanguage(getLanguage() === 'es' ? 'en' : 'es');
    global.location?.reload?.();
  }

  const api = { STORAGE_KEY, SUPPORTED_LANGUAGES, getLanguage, setLanguage, toggleLanguage, translate, apply };
  global.DQOpsI18n = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (typeof document !== 'undefined') {
    document.addEventListener('click', event => {
      if (event.target.closest('[data-language-toggle]')) toggleLanguage();
    });
    const start = () => {
      apply(document);
      if (typeof MutationObserver === 'undefined') return;
      let applying = false;
      const observer = new MutationObserver(mutations => {
        if (applying || getLanguage() !== 'es') return;
        applying = true;
        mutations.forEach(mutation => {
          if (mutation.type === 'characterData') apply(mutation.target);
          mutation.addedNodes.forEach(node => apply(node));
        });
        applying = false;
      });
      observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})(typeof window !== 'undefined' ? window : globalThis);
