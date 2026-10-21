export function validatePath(path, allowRoot = false) {
  if (allowRoot && path === '') return path;
  if (typeof path !== 'string' || !path || Buffer.byteLength(path) > 6144 ||
      path.includes('\0') || path.split('/').length > 200 ||
      path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Use a relative Firestore collection or document path, such as Playtime or users/alex.');
  }
  return path;
}

export function isExcluded(path, exclusions = []) {
  return exclusions.some(excluded => path === excluded || path.startsWith(`${excluded}/`));
}

export function normalizeExclusions(paths = [], maximum = 1000) {
  if (!Array.isArray(paths) || paths.length > maximum) throw new Error('Choose at most 1,000 excluded paths.');
  const sorted = [...new Set(paths.map(path => validatePath(path)))].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
  const result = [];
  for (const path of sorted) if (!isExcluded(path, result)) result.push(path);
  return result;
}
