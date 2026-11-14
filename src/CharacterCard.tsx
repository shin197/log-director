import { isSafeImageUrl } from './importFormats';

export function CharacterAvatar({
  url,
  fallback,
  color,
}: {
  url: string;
  fallback?: string;
  color?: string;
}) {
  return isSafeImageUrl(url) ? (
    <img
      className="char-avatar-img"
      src={url}
      alt=""
      width="44"
      height="44"
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  ) : (
    <span className="char-avatar-fallback" style={{ borderColor: color || undefined }}>
      {(fallback || '?').slice(0, 1)}
    </span>
  );
}

export function CharacterCard({
  name,
  iconUrl,
  color,
}: {
  name: string;
  iconUrl: string;
  color?: string;
}) {
  return (
    <span className="char-nav-main">
      <CharacterAvatar url={iconUrl} fallback={name} color={color} />
      <strong style={{ color: color || undefined }}>{name}</strong>
    </span>
  );
}
