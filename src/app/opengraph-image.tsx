import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const alt = 'FX Target Bill Payment';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const runtime = 'nodejs';

const title = 'FX Target Bill Payment';
const description =
  'Set a target rate on each foreign-currency bill. Pay when the rate hits, or at market by the deadline — never late.';

const background = await readFile(join(process.cwd(), 'public/og-image-bg.png'));
const logomark = await readFile(join(process.cwd(), 'public/logomark.svg'));

const backgroundSrc = `data:image/png;base64,${background.toString('base64')}`;
const logomarkSrc = `data:image/svg+xml;base64,${logomark.toString('base64')}`;

export default async function Image() {
  const [regular, medium] = await Promise.all([loadInter(400), loadInter(500)]);

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        padding: '0 88px 140px',
        backgroundImage: `url(${backgroundSrc})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <img src={logomarkSrc} width={148} height={148} alt="" />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginLeft: 48,
          maxWidth: 780,
        }}
      >
        <div
          style={{
            fontSize: 64,
            fontWeight: 500,
            color: '#f4f4f6',
            lineHeight: 1.05,
            letterSpacing: -1.5,
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 20,
            fontSize: 26,
            fontWeight: 400,
            color: '#a6a6b3',
            lineHeight: 1.35,
          }}
        >
          {description}
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Inter', data: regular, style: 'normal', weight: 400 },
        { name: 'Inter', data: medium, style: 'normal', weight: 500 },
      ],
    },
  );
}

/** Satori needs a truetype face. The old Safari agent makes Google Fonts return one. */
async function loadInter(weight: 400 | 500): Promise<ArrayBuffer> {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}`,
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1',
      },
    },
  );
  if (!css.ok) throw new Error(`Inter stylesheet ${css.status}`);
  const match = (await css.text()).match(/src: url\((.+?)\) format\('truetype'\)/);
  const url = match?.[1];
  if (!url) throw new Error('Inter font URL missing');
  const font = await fetch(url);
  if (!font.ok) throw new Error(`Inter font ${font.status}`);
  return font.arrayBuffer();
}
