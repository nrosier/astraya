/**
 * Test/demo page for restructured Extended Settings (#460).
 * Shows the new grouping with live-reactive descriptions.
 * Validate layout and copy here before integration into ExtendedSettingsPanel.
 *
 * Run: npm run dev, then navigate to a route that renders this component (or add a route manually).
 */

import { useState } from 'react';
import { HOUSE_SYSTEMS } from '../astrology/houses.js';
import type { RulershipChoice } from '../astrology/rulership.js';
import type { SymbolClass } from '../chart/symbol-class.js';
import { GLYPH_WEIGHTS } from '../chart/glyph-weight.js';

export function ExtendedSettingsDemo(): React.JSX.Element {
  const [startingPoint, setStartingPoint] = useState<'tropical' | 'sidereal'>('tropical');
  const [houseSystem, setHouseSystem] = useState<string>(HOUSE_SYSTEMS[0]?.key ?? 'placidus');
  const [rulershipScheme, setRulershipScheme] = useState<RulershipChoice>('modern');
  const [symbolClass, setSymbolClass] = useState<SymbolClass>('drawn');
  const [glyphWeight, setGlyphWeight] = useState<'fine' | 'regular' | 'bold'>('regular');
  const [uranusForm, setUranusForm] = useState<'circle' | 'h-shape'>('circle');
  const [plutoForm, setPlutoForm] = useState<'orb' | 'crescent'>('orb');
  const [isAuthenticated] = useState(false);
  const [saveAsDefault, setSaveAsDefault] = useState<'device' | 'server'>('device');

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Extended Settings — Restructured Layout Demo (#460)</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>
        Validate the grouping, descriptions, and interactivity before integration.
      </p>

      {/* Save As Default Toggle */}
      <div
        style={{
          marginBottom: '2rem',
          padding: '1rem',
          backgroundColor: '#f0f7ff',
          border: '1px solid #0066cc',
          borderRadius: '4px',
        }}
      >
        <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem' }}>Save as Default:</label>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="radio"
              value="device"
              checked={saveAsDefault === 'device'}
              onChange={(e) => setSaveAsDefault(e.target.value as any)}
            />
            <span>
              On Device <span style={{ fontSize: '0.85em', color: '#666' }}>(localStorage, no sync)</span>
            </span>
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: isAuthenticated ? 'pointer' : 'not-allowed',
              opacity: isAuthenticated ? 1 : 0.5,
            }}
          >
            <input
              type="radio"
              value="server"
              checked={saveAsDefault === 'server'}
              onChange={(e) => setSaveAsDefault(e.target.value as any)}
              disabled={!isAuthenticated}
            />
            <span>
              Synced to Account <span style={{ fontSize: '0.85em', color: '#666' }}>(requires sign-in)</span>
            </span>
          </label>
        </div>
        <p style={{ fontSize: '0.85em', color: '#666', marginTop: '0.5rem' }}>
          {saveAsDefault === 'device'
            ? '✓ Saved to browser storage. Available on this device only.'
            : isAuthenticated
              ? '✓ Saved to server. Will sync across all your devices.'
              : '⊘ Sign in to enable synced defaults across devices.'}
        </p>
      </div>

      {/* SECTION 1: Chart Frame (Zodiac & Houses) */}
      <Section title="Chart Frame" subtitle="How the zodiac and houses are calculated">
        {/* Starting Point */}
        <Setting label="Starting Point">
          <select value={startingPoint} onChange={(e) => setStartingPoint(e.target.value as any)}>
            <option value="tropical">Tropical</option>
            <option value="sidereal">Sidereal</option>
          </select>
          <Description>
            {startingPoint === 'tropical'
              ? "The Tropical zodiac is fixed to the seasons. The vernal equinox (Spring) is always at 0° Aries, regardless of where the background stars have moved. This is the standard in Western astrology and most popular software."
              : "The Sidereal zodiac is fixed to the background stars as they are now. Because the stars have precessed about 24° since the tropical zodiac was defined, your Sun sign in sidereal astrology is typically one sign earlier than in tropical (e.g., Western Aries becomes Pisces in sidereal). This is the standard in Vedic astrology."}
          </Description>
        </Setting>

        {/* House System */}
        <Setting label="House System">
          <select value={houseSystem} onChange={(e) => setHouseSystem(e.target.value)}>
            {HOUSE_SYSTEMS.map((sys) => (
              <option key={sys.key} value={sys.key}>
                {sys.key}
              </option>
            ))}
          </select>
          <Description>
            {houseSystem === 'placidus'
              ? "Placidus (the default) divides the MC-to-IC meridian into three equal times, then projects those times onto the ecliptic. It is the most traditional and widely used system in Western astrology."
              : houseSystem === 'koch'
                ? "Koch divides the MC-to-IC meridian in time and space together, accounting for the diurnal motion at your latitude. It is popular for very high-latitude births where Placidus breaks down."
                : houseSystem === 'whole_sign'
                  ? "Whole Sign places each cusp at the beginning of a zodiac sign, so each house spans exactly 30°. It is the ancient system used in classical and Vedic astrology."
                  : houseSystem === 'equal_house'
                    ? "Equal House divides the ecliptic into 12 equal 30° sections starting from the ascendant. It is simple and was used in classical astrology; popular with modern psychological and esoteric practitioners."
                    : houseSystem === 'regiomontanus'
                      ? "Regiomontanus divides the equator into 12 equal parts and projects onto the ecliptic. It is an older European tradition, useful at high latitudes, and the basis for some classical interpretation texts."
                      : "This house system calculates cusps using a specific mathematical method. Check the system's documentation for details."}
          </Description>
        </Setting>
      </Section>

      {/* SECTION 2: Rulership & Dignities (Doctrinal Choice) */}
      <Section title="Rulership & Dignities" subtitle="Which planets rule which zodiac signs">
        <Setting label="Planetary Rulers">
          <select value={rulershipScheme} onChange={(e) => setRulershipScheme(e.target.value as any)}>
            <option value="modern">Modern</option>
            <option value="traditional">Traditional</option>
            <option value="both">Co-rulers</option>
          </select>
          <Description>
            {rulershipScheme === 'modern'
              ? "Modern rulership includes the trans-Saturnian planets (Uranus rules Aquarius, Neptune rules Pisces, Pluto rules Scorpio) discovered in the last 300 years. This is standard in 20th/21st-century Western astrology. Affects dispositors, essential dignities, profections, and chart interpretation."
              : rulershipScheme === 'traditional'
                ? "Traditional rulership uses only the seven classical planets visible to the naked eye (Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn). Aquarius and Pisces are co-ruled by Saturn, and Scorpio by Mars. This reflects pre-telescope astrology and is foundational to medieval and classical systems."
                : "Co-rulers shows both classical and modern rulerships simultaneously—each sign has two rulers (e.g., Aquarius has both Saturn and Uranus). This hybrid approach lets you see how rulerships have evolved and compare traditional and modern interpretations side by side."}
          </Description>
        </Setting>
      </Section>

      {/* SECTION 3: Glyphs & Symbols (Rendering) */}
      <Section title="Glyphs & Symbols" subtitle="How planetary and zodiac symbols are displayed">
        {/* Symbol Class */}
        <Setting label="Symbols">
          <select value={symbolClass} onChange={(e) => setSymbolClass(e.target.value as any)}>
            <option value="unicode">Unicode</option>
            <option value="drawn">Drawn</option>
            <option value="text">Text</option>
          </select>
          <Description>
            {symbolClass === 'unicode'
              ? "Display symbols as Unicode text characters (♅, ♇, ☿, etc.). This uses the font's built-in glyphs and is fast and lightweight, but appearance depends on your font."
              : symbolClass === 'drawn'
                ? "Display symbols as hand-rolled SVG paths. This gives consistent appearance across all devices and allows fine-tuning of line weight and form variants (e.g., Uranus and Pluto have alternate shapes)."
                : "Display symbols as letter codes (♅ becomes 'U', ♇ becomes 'P', etc.). This is compact and always legible, but loses visual distinctiveness."}
          </Description>
        </Setting>

        {/* Line Weight (conditional on "drawn") */}
        <Setting label="Line Weight" disabled={symbolClass !== 'drawn'}>
          <select value={glyphWeight} onChange={(e) => setGlyphWeight(e.target.value as any)} disabled={symbolClass !== 'drawn'}>
            {GLYPH_WEIGHTS.map((w) => (
              <option key={w} value={w}>
                {w.charAt(0).toUpperCase() + w.slice(1)}
              </option>
            ))}
          </select>
          <Description>
            {symbolClass !== 'drawn'
              ? '(Only available when Symbols is set to "Drawn")'
              : glyphWeight === 'fine'
                ? 'Fine lines: delicate, minimal visual weight. Good for dense charts or small screens.'
                : glyphWeight === 'regular'
                  ? 'Regular lines (default): balanced between visibility and elegance.'
                  : 'Bold lines: thick, prominent strokes. Good for large printed charts or low-vision accessibility.'}
          </Description>
        </Setting>

        {/* Forms of a Symbol (conditional on "drawn") */}
        <Setting label="Forms of a Symbol" disabled={symbolClass !== 'drawn'}>
          <div style={{ fontSize: '0.9em', color: '#666' }}>
            {symbolClass !== 'drawn' ? (
              <p>(Only available when Symbols is set to "Drawn")</p>
            ) : (
              <>
                <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid #ddd' }}>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem' }}>Uranus</label>
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        value="circle"
                        checked={uranusForm === 'circle'}
                        onChange={(e) => setUranusForm(e.target.value as any)}
                      />
                      Circle with dot and arrow (⛢)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        value="h-shape"
                        checked={uranusForm === 'h-shape'}
                        onChange={(e) => setUranusForm(e.target.value as any)}
                      />
                      Stylized H-shape
                    </label>
                  </div>
                  <Description>
                    {uranusForm === 'circle'
                      ? "Circle with dot and arrow (⛢): traditional astronomical symbol for Uranus, recognizable across systems."
                      : "Stylized H-shape: modern alternative, compact and distinctive."}
                  </Description>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem' }}>Pluto</label>
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        value="orb"
                        checked={plutoForm === 'orb'}
                        onChange={(e) => setPlutoForm(e.target.value as any)}
                      />
                      Circle with orb
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        value="crescent"
                        checked={plutoForm === 'crescent'}
                        onChange={(e) => setPlutoForm(e.target.value as any)}
                      />
                      P and crescent combined (♇)
                    </label>
                  </div>
                  <Description>
                    {plutoForm === 'orb'
                      ? "Circle with orb: modern symbol representing Pluto as a dwarf planet, recent addition to astrology."
                      : "P and crescent combined (♇): classic historical symbol blending planet and moon imagery, familiar to traditional practitioners."}
                  </Description>
                </div>
              </>
            )}
          </div>
        </Setting>
      </Section>

      {/* Visual notes */}
      <div style={{ marginTop: '3rem', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
        <h3>Demo notes</h3>
        <ul>
          <li>
            <strong>Section structure:</strong> Each section is grouped by astrological concept, with a clear title and subtitle.
          </li>
          <li>
            <strong>Reactive descriptions:</strong> All descriptions update live as you change selections.
          </li>
          <li>
            <strong>Disabled states:</strong> Line Weight and Forms of a Symbol are disabled unless "Drawn" is selected, and the description reflects this.
          </li>
          <li>
            <strong>Visual distinction:</strong> Use fieldsets with legends and horizontal rules between sections (to be styled in integration).
          </li>
          <li>
            <strong>Semantic tags:</strong> In the real UI, each section should carry an "applies on Apply and redraw" or "saved on device" tag to clarify which changes need the Apply button.
          </li>
        </ul>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <fieldset
      style={{
        marginBottom: '2rem',
        padding: '1.5rem',
        border: '1px solid #ddd',
        borderRadius: '4px',
        backgroundColor: '#fafafa',
      }}
    >
      <legend style={{ fontSize: '1.1em', fontWeight: 'bold', marginBottom: '0.5rem' }}>{title}</legend>
      <p style={{ color: '#666', fontSize: '0.9em', marginBottom: '1.5rem' }}>{subtitle}</p>
      {children}
    </fieldset>
  );
}

function Setting({
  label,
  disabled,
  children,
}: {
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      style={{
        marginBottom: '1.5rem',
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      <div style={{ marginBottom: '0.5rem' }}>
        <label style={{ fontWeight: '600', display: 'block', marginBottom: '0.5rem' }}>{label}</label>
        {typeof children === 'object' && (children as any).props?.disabled ? (
          children
        ) : (
          <div>{children}</div>
        )}
      </div>
    </div>
  );
}

function Description({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <p
      style={{
        marginTop: '0.75rem',
        fontSize: '0.9em',
        lineHeight: '1.5',
        color: '#333',
        padding: '0.75rem',
        backgroundColor: '#fff',
        borderLeft: '3px solid #007acc',
      }}
    >
      {children}
    </p>
  );
}
