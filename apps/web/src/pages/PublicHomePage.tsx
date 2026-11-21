import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark } from '../components/BrandMark';
import { ContactComposer } from '../components/ContactComposer';
import { ProjectDemo } from '../components/ProjectDemo';
import { Button } from '../components/ui/button';
import { StatusBadge } from '../components/ui/mitten-ui';
import { useOptionalAuth } from '../context/AuthContext';
import { isWebSerialSupported } from '../utils/devicePresentation';

const contactEmail = import.meta.env.VITE_CONTACT_EMAIL?.trim();

const processSteps = [
  {
    title: 'La mano realiza un gesto',
    text: 'Cinco sensores flex registran la posición de los dedos y el MPU6050 mide la orientación de la mano.',
  },
  {
    title: 'MITTEN interpreta el movimiento',
    text: 'El ESP32 compara las siete dimensiones capturadas con el perfil de gestos aprendido por la persona.',
  },
  {
    title: 'El guante reproduce la frase',
    text: 'Al reconocer el gesto, el ESP32 reproduce desde la microSD la pista WAV asociada mediante el amplificador MAX98357A.',
  },
];

const connectionModes = [
  {
    name: 'Guante por Wi-Fi',
    tag: 'Principal',
    tone: 'primary' as const,
    text: 'Modo recomendado para el uso diario. Se vincula a tu cuenta con un código de un solo uso y funciona desde celular o computadora en cualquier navegador moderno.',
  },
  {
    name: 'Guante por USB',
    tag: 'Respaldo local',
    tone: 'neutral' as const,
    text: 'Conexión directa por cable mediante Web Serial en Chrome o Edge de escritorio. Útil en aulas, ferias o entornos sin Wi-Fi 2.4 GHz ni acceso a Internet.',
  },
  {
    name: 'Modo demostración',
    tag: 'Sin hardware',
    tone: 'warning' as const,
    text: 'Simulador integrado del ESP32 con el mismo protocolo V2 para probar captura, sincronización, carga de audio y reconocimiento sin placa física.',
  },
];

const faqs = [
  {
    question: '¿MITTEN necesita una computadora o Internet para funcionar?',
    answer: 'La aplicación web —desde el celular por Wi-Fi o desde una computadora— solo se usa para configurar, capturar, enviar audios y sincronizar. Después, el reconocimiento y la reproducción de voz ocurren localmente en el guante sin Internet ni PC.',
  },
  {
    question: '¿Todos deben aprender los mismos gestos?',
    answer: 'No. Cada persona construye su propia biblioteca y decide qué movimientos y frases quiere conservar.',
  },
  {
    question: '¿Cómo se conecta el guante y en qué navegadores funciona?',
    answer: 'Por defecto se conecta mediante Guante por Wi-Fi, que usa WebSocket estándar y funciona en cualquier navegador moderno, incluidos celulares. Si no tenés Wi-Fi 2.4 GHz o conexión a Internet, podés usar el respaldo Guante por USB (Web Serial en Chrome o Edge de escritorio por HTTPS) o ensayar en Modo demostración.',
  },
  {
    question: '¿Cómo se cargan las voces en la microSD del guante?',
    answer: 'Cada gesto genera su frase con síntesis de voz (TTS). Desde el panel «Audio en el guante», tu navegador la convierte automáticamente a WAV PCM 16 kHz mono y la envía al guante sin sacar la microSD; también podés descargar un respaldo ZIP.',
  },
  {
    question: '¿Es un dispositivo médico?',
    answer: 'No. MITTEN V2.1 es un prototipo funcional educativo. Su efectividad clínica todavía no fue establecida.',
  },
];

const sectionLinks = [
  { href: '#funcionamiento', label: 'Cómo funciona' },
  { href: '#tecnologia', label: 'Tecnología' },
  { href: '#demostracion', label: 'Demostración' },
  { href: '#contacto', label: 'Contacto' },
] as const;

function HeroSystemDiagram() {
  return (
    <div className="hero-system" aria-label="Recorrido de una señal: mano, sensores, ESP32 y audio">
      <svg className="hero-system__art" viewBox="0 0 520 430" role="img" aria-labelledby="hero-diagram-title hero-diagram-description">
        <title id="hero-diagram-title">Cómo MITTEN convierte un gesto en audio</title>
        <desc id="hero-diagram-description">Una mano equipada con sensores envía datos al ESP32, que activa una pista de audio.</desc>
        <path className="hero-system__orbit" d="M71 320C154 369 277 377 376 318C446 276 475 193 437 120" />
        <circle className="hero-system__signal" cx="71" cy="320" r="7" />

        <g className="hero-system__brand">
          <image href="/brand/06_isotipo_gradiente.svg" x="82" y="126" width="190" height="173" />
        </g>

        <g className="hero-system__node" transform="translate(355 64)">
          <rect width="116" height="72" rx="18" />
          <text x="58" y="32">7 dimensiones</text>
          <text x="58" y="52">capturadas</text>
        </g>
        <g className="hero-system__node" transform="translate(355 177)">
          <rect width="116" height="72" rx="18" />
          <text x="58" y="32">ESP32</text>
          <text x="58" y="52">reconoce</text>
        </g>
        <g className="hero-system__node hero-system__node--audio" transform="translate(355 290)">
          <rect width="116" height="72" rx="18" />
          <text x="58" y="32">Audio I²S</text>
          <text x="58" y="52">reproduce</text>
        </g>

        <path className="hero-system__connector" d="M262 163C307 151 321 104 355 101" />
        <path className="hero-system__connector" d="M262 217C314 217 318 213 355 213" />
        <path className="hero-system__connector" d="M251 280C303 294 316 326 355 326" />
      </svg>
      <div className="hero-system__caption">
        <span className="status-dot" aria-hidden="true" />
        Procesamiento local después de sincronizar
      </div>
    </div>
  );
}

export function PublicHomePage() {
  const auth = useOptionalAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const browserReady = isWebSerialSupported();
  const isAuthenticated = Boolean(auth?.isAuthenticated);
  const appPath = isAuthenticated ? '/app' : '/login';
  const appActionLabel = isAuthenticated ? 'Ir al panel' : 'Abrir la aplicación';

  return (
    <div className="public-site">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>

      <header className="public-header">
        <div className="public-container public-header__inner">
          <BrandMark />
          <nav className="public-nav" aria-label="Navegación del proyecto">
            {sectionLinks.map((item) => (
              <a key={item.href} href={item.href}>{item.label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to={appPath}>{appActionLabel}</Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="min-[901px]:hidden"
              aria-expanded={mobileMenuOpen}
              aria-controls="public-mobile-nav"
              aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
              onClick={() => setMobileMenuOpen((prev) => !prev)}
            >
              {mobileMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </Button>
          </div>
        </div>
        {mobileMenuOpen ? (
          <nav
            id="public-mobile-nav"
            aria-label="Menú móvil del proyecto"
            className="border-t border-border bg-surface px-4 py-3 min-[901px]:hidden"
          >
            <div className="flex flex-col gap-1">
              {sectionLinks.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-text hover:bg-mist"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </nav>
        ) : null}
      </header>

      <main id="contenido">
        <section className="hero-section">
          <div className="public-container hero-grid">
            <div className="hero-copy">
              <h1>Cada gesto tiene algo que decir.</h1>
              <p className="hero-lead">MITTEN es un guante inteligente de comunicación que reconoce gestos configurados y reproduce sus mensajes de voz sin depender de una computadora durante el uso cotidiano.</p>
              <div className="hero-actions">
                <Button asChild size="lg">
                  <a href="#funcionamiento">Descubrir MITTEN</a>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to={appPath}>{isAuthenticated ? 'Ir al panel' : 'Configurar mi guante'}</Link>
                </Button>
              </div>
              <p className="hero-note">Prototipo funcional educativo · MITTEN V2.1</p>
            </div>
            <HeroSystemDiagram />
          </div>
          <div className="public-container fact-rail" aria-label="Características principales">
            <div><strong>5</strong><span>sensores flex</span></div>
            <div><strong>7</strong><span>dimensiones por muestra</span></div>
            <div><strong>50</strong><span>gestos por perfil</span></div>
            <div><strong>Local</strong><span>reconocimiento y audio</span></div>
          </div>
          <div className="public-container browser-check" role="status">
            <span className={`browser-check__icon ${browserReady ? 'browser-check__icon--ready' : ''}`} aria-hidden="true">
              {browserReady ? '✓' : 'i'}
            </span>
            <div>
              <strong>{browserReady ? 'Este navegador admite Wi-Fi y respaldo por USB' : 'Listo para conectar por Wi-Fi · USB requiere navegador compatible'}</strong>
              <span>
                {browserReady
                  ? 'Podés configurar MITTEN por Wi-Fi desde cualquier dispositivo o conectarlo por cable USB mediante Web Serial.'
                  : 'Podés usar Guante por Wi-Fi y Modo demostración desde este navegador (incluido celular). El respaldo por cable USB requiere Chrome o Edge en escritorio por HTTPS.'}
              </span>
            </div>
          </div>
        </section>

        <section className="public-section story-section" id="alcance" aria-labelledby="purpose-title">
          <div className="public-container story-grid">
            <div className="section-heading">
              <h2 id="purpose-title">Tecnología para expresar una intención de forma directa.</h2>
            </div>
            <div className="story-copy">
              <p className="story-copy__lead">MITTEN busca transformar gestos configurados por cada persona en audio comprensible, mediante un dispositivo portable y autónomo después de su preparación.</p>
              <div className="scope-list">
                <article>
                  <h3>Lo que hace</h3>
                  <p>Captura gestos, mantiene una biblioteca personal, prepara sus frases de audio y sincroniza el perfil completo con el guante.</p>
                </article>
                <article>
                  <h3>Lo que no promete</h3>
                  <p>No interpreta una lengua de señas completa ni se presenta como dispositivo médico. Es un prototipo escolar en evolución.</p>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section className="public-section process-section" id="funcionamiento" aria-labelledby="process-title">
          <div className="public-container">
            <div className="section-heading section-heading--horizontal">
              <div>
                <h2 id="process-title">De la mano al parlante, en tres momentos.</h2>
              </div>
              <p>La web prepara el perfil. El guante realiza el reconocimiento y reproduce la frase de manera local.</p>
            </div>
            <ol className="process-list">
              {processSteps.map((step, index) => (
                <li key={step.title}>
                  <span className="process-number" aria-hidden="true">{index + 1}</span>
                  <div><h3>{step.title}</h3><p>{step.text}</p></div>
                </li>
              ))}
            </ol>

            <div className="mt-10 border-t border-border pt-8">
              <h3 className="text-lg font-bold text-text">Tres formas de conectar el guante</h3>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                {connectionModes.map((mode) => (
                  <article key={mode.name} className="rounded-2xl border border-border bg-surface p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-base font-bold text-text">{mode.name}</h4>
                      <StatusBadge tone={mode.tone}>{mode.tag}</StatusBadge>
                    </div>
                    <p className="mt-2.5 text-sm leading-6 text-text-muted">{mode.text}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="public-section technology-section" id="tecnologia" aria-labelledby="technology-title">
          <div className="public-container">
            <div className="section-heading section-heading--horizontal">
              <div>
                <h2 id="technology-title">Una arquitectura pequeña, comprensible y mantenible.</h2>
              </div>
              <p>Cada pieza tiene una responsabilidad concreta. La nube no participa del reconocimiento cotidiano.</p>
            </div>

            <div className="technology-board">
              <article className="technology-column">
                <div className="technology-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M7 3v3M12 3v3M17 3v3M7 18v3M12 18v3M17 18v3M3 7h3M3 12h3M3 17h3M18 7h3M18 12h3M18 17h3M7 7h10v10H7z" /></svg>
                </div>
                <h3>Dentro del guante</h3>
                <ul>
                  <li><span>ESP32</span><small>Control y reconocimiento</small></li>
                  <li><span>5 sensores flex</span><small>Flexión de los dedos</small></li>
                  <li><span>MPU6050</span><small>Orientación y movimiento</small></li>
                  <li><span>MAX98357A</span><small>Amplificador I²S (WAV PCM)</small></li>
                  <li><span>microSD y parlante</span><small>Audio disponible sin PC</small></li>
                </ul>
              </article>

              <div className="technology-spine" aria-hidden="true"><span /><span /><span /></div>

              <article className="technology-column">
                <div className="technology-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M4 5h16v11H4zM8 20h8M12 16v4M8 9l-2 2 2 2M16 9l2 2-2 2M13.5 8l-3 6" /></svg>
                </div>
                <h3>En la aplicación</h3>
                <ul>
                  <li><span>React + TypeScript</span><small>Interfaz, WebSocket relay y Web Serial</small></li>
                  <li><span>Node.js + Express</span><small>API REST, relay Wi-Fi y síntesis TTS</small></li>
                  <li><span>SQLite / PostgreSQL</span><small>Cuentas, guantes vinculados y bibliotecas</small></li>
                  <li><span>Conversión WAV local</span><small>MP3 a WAV PCM 16 kHz en el navegador</small></li>
                  <li><span>MicroPython + Protocolo V2</span><small>Firmware modular y NDJSON transaccional</small></li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        <ProjectDemo />

        <section className="public-section capability-section" aria-labelledby="capability-title">
          <div className="public-container capability-grid">
            <div className="section-heading">
              <h2 id="capability-title">Preparar el guante sin ocultar lo importante.</h2>
              <p>La interfaz acompaña la conexión, el aprendizaje y la sincronización, mostrando siempre el estado real de MITTEN.</p>
              <Link className="text-link" to={appPath}>
                {isAuthenticated ? 'Ir al panel de configuración' : 'Entrar al panel de configuración'}
              </Link>
            </div>
            <ul className="capability-list">
              <li><strong>Biblioteca personal</strong><span>Creá, editá, buscá y eliminá gestos propios.</span></li>
              <li><strong>Captura guiada</strong><span>Registrá el movimiento directamente desde el guante por Wi-Fi o USB.</span></li>
              <li><strong>Voces directas a la microSD</strong><span>Generá frases por TTS, convertilas a WAV en tu navegador y subilas al guante sin retirar la tarjeta (con respaldo ZIP).</span></li>
              <li><strong>Sincronización segura</strong><span>Reemplaza el perfil completo de forma transaccional sin perder el anterior ante un fallo.</span></li>
              <li><strong>Guantes vinculados por cuenta</strong><span>Vinculá el guante por Wi-Fi con códigos de un solo uso y revocá el acceso cuando quieras desde tu cuenta.</span></li>
              <li><strong>Simulador integrado</strong><span>Ensayá todo el recorrido en Modo demostración antes de conectar un guante físico.</span></li>
            </ul>
          </div>
        </section>

        <section className="public-section faq-section" aria-labelledby="faq-title">
          <div className="public-container faq-grid">
            <div className="section-heading">
              <h2 id="faq-title">Lo esencial, antes de conectar el guante.</h2>
            </div>
            <div className="faq-list">
              {faqs.map((item, index) => (
                <details key={item.question} open={index === 0}>
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="contact-section" id="contacto" aria-labelledby="contact-title">
          <div className={`public-container contact-panel ${contactEmail ? 'contact-panel--form' : ''}`}>
            <div>
              <h2 id="contact-title">Conversemos sobre MITTEN.</h2>
              <p>Consultas sobre el proyecto, demostraciones educativas y posibilidades de colaboración.</p>
            </div>
            {contactEmail ? (
              <ContactComposer email={contactEmail} />
            ) : (
              <div className="contact-pending" role="note">
                <strong>Canal en preparación</strong>
                <span>El equipo publicará aquí su canal oficial de contacto.</span>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="public-footer">
        <div className="public-container public-footer__inner">
          <BrandMark />
          <p>MITTEN V2.1 · Prototipo funcional educativo.</p>
          <div className="public-footer__links">
            <Link to="/privacidad">Privacidad</Link>
            <Link to={appPath}>{isAuthenticated ? 'Ir al panel' : 'Acceder a la aplicación'}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
