import { FormEvent, useState } from 'react';

function buildContactMessage(name: string, topic: string, message: string) {
  const subject = `Consulta MITTEN · ${topic}`;
  const body = [`Nombre: ${name.trim() || 'No indicado'}`, '', message.trim()].join('\n');
  return { subject, body };
}

export function buildContactMailto(email: string, name: string, topic: string, message: string): string {
  const { subject, body } = buildContactMessage(name, topic, message);
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function ContactComposer({ email }: { email: string }) {
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('Consulta sobre el proyecto');
  const [message, setMessage] = useState('');
  const [channel, setChannel] = useState('gmail');
  const { subject, body } = buildContactMessage(name, topic, message);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    // Gmail uses native form navigation, so no mail handler or scripted popup is needed.
    if (channel === 'gmail') return;
    event.preventDefault();
    window.location.href = buildContactMailto(email, name, topic, message);
  };

  return (
    <form
      className="contact-form"
      action={channel === 'gmail' ? 'https://mail.google.com/mail/' : undefined}
      method="get"
      target={channel === 'gmail' ? '_blank' : undefined}
      rel="noopener noreferrer"
      onSubmit={handleSubmit}
    >
      {channel === 'gmail' && (
        <>
          <input type="hidden" name="view" value="cm" />
          <input type="hidden" name="fs" value="1" />
          <input type="hidden" name="to" value={email} />
          <input type="hidden" name="su" value={subject} />
          <input type="hidden" name="body" value={body} />
        </>
      )}
      <div className="contact-form__row">
        <label>
          <span>Tu nombre</span>
          <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={80} />
        </label>
        <label>
          <span>Motivo</span>
          <select value={topic} onChange={(event) => setTopic(event.target.value)}>
            <option>Consulta sobre el proyecto</option>
            <option>Solicitar una demostración</option>
            <option>Proponer una colaboración</option>
          </select>
        </label>
      </div>
      <label>
        <span>Mensaje</span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          required
          minLength={10}
          maxLength={1200}
          rows={4}
          placeholder="Contanos brevemente cómo podemos ayudarte."
        />
      </label>
      <label>
        <span>Abrir con</span>
        <select value={channel} onChange={(event) => setChannel(event.target.value)}>
          <option value="gmail">Gmail en el navegador</option>
          <option value="mailto">Aplicación de correo</option>
        </select>
      </label>
      <div className="contact-form__footer">
        <p>{channel === 'gmail'
          ? 'Se abrirá un borrador en Gmail en otra pestaña. Revisalo y envialo desde allí.'
          : 'Se abrirá la aplicación de correo configurada en tu PC.'} MITTEN no guarda este mensaje.</p>
        <button className="button button--light" type="submit">{channel === 'gmail' ? 'Abrir Gmail' : 'Preparar correo'}</button>
      </div>
    </form>
  );
}
