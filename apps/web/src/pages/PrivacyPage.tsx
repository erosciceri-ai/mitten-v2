import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark } from '../components/BrandMark';

const contactEmail = import.meta.env.VITE_CONTACT_EMAIL?.trim();

export function PrivacyPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Privacidad — MITTEN V2.1';
    return () => { document.title = previousTitle; };
  }, []);

  return (
    <div className="legal-page">
      <a className="skip-link" href="#privacy-content">Saltar al contenido</a>
      <header className="legal-header">
        <div className="public-container legal-header__inner">
          <BrandMark />
          <Link className="button button--compact button--outline" to="/">Volver al proyecto</Link>
        </div>
      </header>

      <main className="public-container legal-layout" id="privacy-content">
        <aside className="legal-summary" aria-label="Resumen de privacidad">
          <p>En pocas palabras</p>
          <strong>MITTEN usa tus datos para mantener tu cuenta y tu biblioteca de gestos.</strong>
          <ul>
            <li>No contiene publicidad.</li>
            <li>No incorpora analítica de terceros.</li>
            <li>Google se usa sólo para identificarte, si elegís esa opción.</li>
            <li>Web Serial conecta el navegador directamente con el guante.</li>
          </ul>
        </aside>

        <article className="legal-document">
          <header>
            <p className="section-index">Transparencia de datos</p>
            <h1>Política de privacidad de MITTEN V2.1</h1>
            <p className="legal-updated">Última actualización: 8 de octubre de 2026</p>
          </header>

          {!contactEmail && (
            <div className="legal-notice" role="note">
              <strong>Documento operativo en preparación</strong>
              <p>Describe el comportamiento actual del prototipo, pero todavía falta identificar al responsable y publicar un canal de contacto antes de ofrecer MITTEN como servicio público.</p>
            </div>
          )}

          <section>
            <h2>1. Alcance</h2>
            <p>Esta política explica el tratamiento de datos en la aplicación web, la API y el flujo de configuración del prototipo educativo MITTEN. No describe servicios futuros que todavía no estén implementados.</p>
          </section>

          <section>
            <h2>2. Datos que utiliza MITTEN</h2>
            <ul>
              <li><strong>Cuenta:</strong> correo electrónico, contraseña protegida mediante hash cuando se usa acceso tradicional y fechas técnicas de creación o actualización.</li>
              <li><strong>Acceso con Google:</strong> correo verificado y el identificador estable de la cuenta de Google. MITTEN no recibe la contraseña de Google.</li>
              <li><strong>Biblioteca personal:</strong> nombres de gestos, muestras de los cinco sensores flex y del MPU6050, resúmenes de captura y asignaciones de pistas de audio.</li>
              <li><strong>Sesión local:</strong> el navegador conserva un token de sesión en <code>localStorage</code> para mantener el acceso a la cuenta.</li>
            </ul>
          </section>

          <section>
            <h2>3. Para qué se utilizan</h2>
            <p>Los datos permiten autenticar a la persona, mantener su biblioteca privada, preparar el audio asociado, capturar gestos y sincronizar un perfil con el ESP32. MITTEN no vende datos personales ni los utiliza para publicidad.</p>
          </section>

          <section>
            <h2>4. Inicio de sesión con Google</h2>
            <p>Si elegís Google, el navegador recibe una credencial de Google Identity Services y la API de MITTEN la verifica. MITTEN almacena el correo verificado y el identificador <code>sub</code> para reconocer la misma cuenta en futuros ingresos.</p>
            <p>Este acceso no concede permisos sobre Drive, Gmail, Calendar ni otros productos de Google. La vinculación con una cuenta MITTEN existente requiere una sesión activa y el mismo correo verificado.</p>
          </section>

          <section>
            <h2>5. Comunicación con el guante</h2>
            <p>Web Serial conecta el navegador directamente con el ESP32. El puerto no pertenece al backend ni a Google. Cuando decidís guardar una captura, sus muestras pasan a formar parte de tu biblioteca en la API; cuando sincronizás, el perfil se copia al almacenamiento local del guante.</p>
          </section>

          <section>
            <h2>6. Cookies, analítica y terceros</h2>
            <p>La implementación actual no utiliza cookies publicitarias ni herramientas de analítica de terceros. Además de la API de MITTEN, el único servicio externo previsto es Google Identity Services cuando el acceso con Google está configurado.</p>
          </section>

          <section>
            <h2>7. Conservación y control</h2>
            <p>La información permanece asociada a la cuenta mientras ésta exista. Desde “Tu cuenta” podés descargar una copia JSON de los datos públicos de la cuenta y de todos sus gestos. Cerrar sesión elimina el token del navegador, pero no elimina la cuenta ni su biblioteca. La eliminación completa todavía no dispone de un flujo de autoservicio.</p>
          </section>

          <section>
            <h2>8. Seguridad y límites</h2>
            <p>Las contraseñas no se almacenan en texto plano y las operaciones privadas requieren autenticación. Aun así, MITTEN es un prototipo escolar en desarrollo y no debe utilizarse para guardar información médica, secretos o datos cuya pérdida pueda causar un perjuicio importante.</p>
          </section>

          <section>
            <h2>9. Contacto</h2>
            {contactEmail ? (
              <p>Para consultas sobre privacidad o solicitudes relacionadas con una cuenta, escribí a <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.</p>
            ) : (
              <p>El canal responsable todavía no fue publicado. MITTEN no debe habilitarse como servicio público ni enviarse a verificación de Google hasta completar este dato.</p>
            )}
          </section>

          <section>
            <h2>10. Cambios en esta política</h2>
            <p>La política deberá actualizarse antes de incorporar nuevas categorías de datos, proveedores externos o usos distintos de los aquí descritos.</p>
          </section>
        </article>
      </main>

      <footer className="public-footer">
        <div className="public-container public-footer__inner">
          <BrandMark inverse />
          <p>MITTEN V2.1 · Prototipo funcional educativo.</p>
          <Link to="/">Conocer el proyecto</Link>
        </div>
      </footer>
    </div>
  );
}
