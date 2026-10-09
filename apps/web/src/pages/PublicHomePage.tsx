import { Link } from 'react-router-dom';
import { BrandMark } from '../components/BrandMark';
import { ContactComposer } from '../components/ContactComposer';
import { ProjectDemo } from '../components/ProjectDemo';

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
    text: 'Al reconocer el gesto, el DFPlayer Mini reproduce desde la microSD la pista de audio asociada.',
  },
];

const faqs = [
  {
    question: '¿MITTEN necesita una computadora para funcionar?',
    answer: 'La computadora se usa para configurar, capturar y sincronizar. Después, el reconocimiento y la reproducción de audio ocurren localmente en el guante.',
  },
  {
    question: '¿Todos deben aprender los mismos gestos?',
    answer: 'No. Cada persona construye su propia biblioteca y decide qué movimientos y frases quiere conservar.',
  },
  {
    question: '¿Funciona en cualquier navegador?',
    answer: 'La conexión directa usa Web Serial, una tecnología con disponibilidad limitada. La aplicación debe abrirse en un navegador compatible y desde un sitio seguro HTTPS.',
  },
  {
    question: '¿Es un dispositivo médico?',
    answer: 'No. MITTEN V2.1 es un prototipo funcional educativo. Su efectividad clínica todavía no fue establecida.',
  },
];

function HeroSystemDiagram() {
  return (
    <div className="hero-system" aria-label="Recorrido de una señal: mano, sensores, ESP32 y audio">
      <svg className="hero-system__art" viewBox="0 0 520 430" role="img" aria-labelledby="hero-diagram-title hero-diagram-description">
        <title id="hero-diagram-title">Cómo MITTEN convierte un gesto en audio</title>
        <desc id="hero-diagram-description">Una mano equipada con sensores envía datos al ESP32, que activa una pista de audio.</desc>
        <defs>
          <linearGradient id="glove-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e2f7f4" />
            <stop offset="1" stopColor="#b8e8e2" />
          </linearGradient>
          <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="16" stdDeviation="18" floodColor="#092f3b" floodOpacity=".16" />
          </filter>
        </defs>

        <path className="hero-system__orbit" d="M71 320C154 369 277 377 376 318C446 276 475 193 437 120" />
        <circle className="hero-system__signal" cx="71" cy="320" r="7" />

        <g filter="url(#soft-shadow)">
          <path className="hero-system__glove" fill="url(#glove-fill)" d="M128 296c-20-35-28-72-23-111l7-58c2-15 23-13 23 2v58-99c0-17 24-18 25-1l2 92 2-119c0-18 26-18 27 0l3 118 2-102c0-17 25-17 26 0l3 108 4-75c1-16 24-15 25 1l4 104c2 58-40 111-98 119-48 6-93-16-113-37Z" />
        </g>

        <g className="hero-system__sensor-lines" aria-hidden="true">
          <path d="M146 94v95" /><path d="M176 66v111" /><path d="M208 82v100" /><path d="M239 114v76" /><path d="M139 209c30 21 64 24 101 7" />
        </g>

        <g className="hero-system__module" transform="translate(158 227)">
          <rect width="74" height="55" rx="12" />
          <path d="M15 17h44M15 27h29M15 37h36" />
          <circle cx="59" cy="37" r="4" />
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
          <text x="58" y="32">DFPlayer</text>
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
  const hasWebSerial = typeof navigator !== 'undefined' && 'serial' in navigator;
  const hasSecureContext = typeof window !== 'undefined' && window.isSecureContext;
  const browserReady = hasWebSerial && hasSecureContext;

  return (
    <div className="public-site">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>

      <header className="public-header">
        <div className="public-container public-header__inner">
          <BrandMark />
          <nav className="public-nav" aria-label="Navegación del proyecto">
            <a href="#funcionamiento">Cómo funciona</a>
            <a href="#tecnologia">Tecnología</a>
            <a href="#demostracion">Demostración</a>
            <a href="#contacto">Contacto</a>
          </nav>
          <Link className="button button--compact button--outline" to="/login">Abrir la aplicación</Link>
        </div>
      </header>

      <main id="contenido">
        <section className="hero-section">
          <div className="public-container hero-grid">
            <div className="hero-copy">
              <p className="hero-kicker">Guante electrónico de comunicación</p>
              <h1>Gestos personales convertidos en frases habladas.</h1>
              <p className="hero-lead">MITTEN aprende movimientos de la mano, los reconoce en un ESP32 y reproduce audio sin depender de una computadora durante el uso cotidiano.</p>
              <div className="hero-actions">
                <a className="button button--primary" href="#funcionamiento">Descubrir MITTEN</a>
                <Link className="button button--quiet" to="/login">Configurar mi guante</Link>
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
              {browserReady ? '✓' : '!'}
            </span>
            <div>
              <strong>{browserReady ? 'Este navegador puede conectar MITTEN' : 'La conexión necesita un navegador compatible'}</strong>
              <span>
                {browserReady
                  ? 'Web Serial y el contexto seguro están disponibles.'
                  : 'Usá un navegador con Web Serial y abrí la aplicación mediante HTTPS para conectar el guante.'}
              </span>
            </div>
          </div>
        </section>

        <section className="public-section story-section" id="alcance" aria-labelledby="purpose-title">
          <div className="public-container story-grid">
            <div className="section-heading">
              <p className="section-index">Objetivo y alcance</p>
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
                <p className="section-index">Funcionamiento</p>
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
          </div>
        </section>

        <section className="public-section technology-section" id="tecnologia" aria-labelledby="technology-title">
          <div className="public-container">
            <div className="section-heading section-heading--horizontal">
              <div>
                <p className="section-index">Hardware y software</p>
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
                  <li><span>DFPlayer Mini</span><small>Reproducción de MP3</small></li>
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
                  <li><span>React + TypeScript</span><small>Interfaz y Web Serial</small></li>
                  <li><span>Node.js + Express</span><small>API y lógica de aplicación</small></li>
                  <li><span>SQLite</span><small>Usuarios y bibliotecas</small></li>
                  <li><span>MicroPython</span><small>Firmware modular del ESP32</small></li>
                  <li><span>Protocolo V2</span><small>NDJSON transaccional</small></li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        <ProjectDemo />

        <section className="public-section capability-section" aria-labelledby="capability-title">
          <div className="public-container capability-grid">
            <div className="section-heading">
              <p className="section-index">Aplicación web</p>
              <h2 id="capability-title">Preparar el guante sin ocultar lo importante.</h2>
              <p>La interfaz acompaña la conexión, el aprendizaje y la sincronización, mostrando siempre el estado real de MITTEN.</p>
              <Link className="text-link" to="/login">Entrar al panel de configuración</Link>
            </div>
            <ul className="capability-list">
              <li><strong>Biblioteca personal</strong><span>Crea, edita, busca y elimina gestos propios.</span></li>
              <li><strong>Captura guiada</strong><span>Registra el movimiento directamente desde el guante.</span></li>
              <li><strong>Audio asociado</strong><span>Prepara y revisa la frase que reproducirá cada gesto.</span></li>
              <li><strong>Sincronización segura</strong><span>Reemplaza el perfil completo sin perder el anterior ante un fallo.</span></li>
            </ul>
          </div>
        </section>

        <section className="public-section faq-section" aria-labelledby="faq-title">
          <div className="public-container faq-grid">
            <div className="section-heading">
              <p className="section-index">Preguntas frecuentes</p>
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
              <p className="section-index">Contacto</p>
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
          <BrandMark inverse />
          <p>MITTEN V2.1 · Prototipo funcional educativo.</p>
          <div className="public-footer__links">
            <Link to="/privacidad">Privacidad</Link>
            <Link to="/login">Acceder a la aplicación</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
