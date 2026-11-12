import { CanvasTexture, SRGBColorSpace, Sprite, SpriteMaterial } from 'three';

const badgeMaterials = new Map<string, SpriteMaterial>();

/** A round badge with a character, always facing the camera. Badges with the same text and colour share one texture. */
export function textSprite(text: string, color: string) {
  const sprite = new Sprite(badgeMaterial(text, color));
  sprite.scale.setScalar(1.8);
  sprite.renderOrder = 1;
  return sprite;
}

/** The shared material for a badge with this text and colour. */
export function badgeMaterial(text: string, color: string) {
  const key = `${text}|${color}`;
  let material = badgeMaterials.get(key);
  if (!material) {
    material = new SpriteMaterial({ map: badgeTexture(text, color), depthTest: false });
    badgeMaterials.set(key, material);
  }
  return material;
}

function badgeTexture(text: string, color: string) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${size * (text.length > 2 ? 0.38 : 0.55)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2 + 4);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
