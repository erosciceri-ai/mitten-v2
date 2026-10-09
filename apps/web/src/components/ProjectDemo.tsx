import { type CSSProperties, useEffect, useState } from 'react';

type DemoStage = 'idle' | 'sensing' | 'matching' | 'speaking';

const stages: Record<DemoStage, { label: string; detail: string }> = {
  idle: {
    label: 'Listo para demostrar',
    detail: 'Iniciá la secuencia para recorrer el procesamiento local de un gesto.',
  },
  sensing: {
    label: 'Leyendo sensores',
    detail: 'Los cinco sensores flex y el MPU6050 forman una muestra de siete dimensiones.',
  },
  matching: {
    label: 'Comparando el gesto',
    detail: 'El ESP32 contrasta la muestra con el perfil que fue sincronizado previamente.',
  },
  speaking: {
    label: 'Frase reconocida',
    detail: 'El DFPlayer Mini reproduce la pista preparada desde la microSD.',
  },
};

const sensorValues = [72, 41, 84, 56, 35];

export function ProjectDemo() {
  const [stage, setStage] = useState<DemoStage>('idle');

  useEffect(() => {
    if (stage === 'idle' || stage === 'speaking') return undefined;

    const timer = window.setTimeout(() => {
      setStage(stage === 'sensing' ? 'matching' : 'speaking');
    }, 1100);

    return () => window.clearTimeout(timer);
  }, [stage]);

  const running = stage === 'sensing' || stage === 'matching';

  return (
    <section className="public-section demo-section" id="demostracion" aria-labelledby="demo-title">
      <div className="public-container demo-grid">
        <div className="section-heading demo-copy">
          <p className="section-index">Demostración conceptual</p>
          <h2 id="demo-title">Seguí una señal mientras se convierte en voz.</h2>
          <p>
            Esta secuencia explica el recorrido de los datos. No simula la precisión del reconocimiento
            ni sustituye una prueba con el guante físico.
          </p>
          <button
            className="button button--primary"
            type="button"
            disabled={running}
            onClick={() => setStage('sensing')}
          >
            {stage === 'speaking' ? 'Repetir demostración' : running ? 'Procesando…' : 'Simular un gesto'}
          </button>
        </div>

        <div className={`signal-console signal-console--${stage}`}>
          <div className="signal-console__topline">
            <span>MITTEN / recorrido local</span>
            <span className="signal-console__state" aria-live="polite">{stages[stage].label}</span>
          </div>

          <div className="signal-console__sensors" aria-label="Lecturas conceptuales de los cinco sensores flex">
            {sensorValues.map((value, index) => (
              <div className="sensor-channel" key={`${value}-${index}`}>
                <span>F{index + 1}</span>
                <div aria-hidden="true"><i style={{ '--sensor-scale': value / 100 } as CSSProperties} /></div>
                <strong>{stage === 'idle' ? '—' : value}</strong>
              </div>
            ))}
          </div>

          <div className="signal-console__route" aria-label="Etapas de la demostración">
            <div className={stage !== 'idle' ? 'is-active' : ''}><span>01</span><strong>Sensores</strong></div>
            <i aria-hidden="true" />
            <div className={stage === 'matching' || stage === 'speaking' ? 'is-active' : ''}><span>02</span><strong>ESP32</strong></div>
            <i aria-hidden="true" />
            <div className={stage === 'speaking' ? 'is-active' : ''}><span>03</span><strong>Audio</strong></div>
          </div>

          <div className="signal-console__result">
            <span>{stage === 'speaking' ? 'Salida preparada' : 'Estado del proceso'}</span>
            <strong>{stage === 'speaking' ? '“Necesito ayuda”' : stages[stage].detail}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
