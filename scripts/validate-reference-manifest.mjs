import { readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const manifestPath = fileURLToPath(
  new URL('../reference-corpus/manifest.json', import.meta.url)
)
const errors = []
const assets = []

const MODES = new Set(['outline-only', 'outline-and-stamp', 'text-logo', 'multipart', 'unknown'])
const MODE_STATUSES = new Set(['provisional', 'needs-review', 'confirmed'])
const SPLITS = new Set(['development', 'held-out'])
const ROLES = new Set([
  'source-vector',
  'reference-mesh',
  'variant-mesh',
  'project-model',
  'component-model',
  'component-mesh',
  'combined-set',
  'cutter-mesh',
  'stamp-mesh',
  'reference-image',
  'render-image',
  'decorating-guide'
])
const FORMATS = new Set(['svg', 'obj', '3mf', 'stl', 'png', 'jpg', 'jpeg'])
const UNITS = new Set(['mm', 'cm', 'in', 'unknown', 'not-applicable'])

function addError(location, message) {
  errors.push(`${location}: ${message}`)
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(value, location) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    addError(location, 'must be a non-empty string')
    return false
  }
  return true
}

function optionalStringOrNull(value, location) {
  if (value !== null && value !== undefined && typeof value !== 'string') {
    addError(location, 'must be a string or null')
  }
}

function validateSafeRelativePath(value, location) {
  if (!requireString(value, location)) return false
  if (value.includes('\0')) addError(location, 'must not contain a null character')
  if (value.includes('\\')) addError(location, 'must use forward slashes')
  if (path.posix.isAbsolute(value) || /^[A-Za-z]:/.test(value)) {
    addError(location, 'must be relative to the external corpus root')
  }
  const segments = value.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    addError(location, 'must not contain empty, dot, or parent-directory segments')
  }
  if (path.posix.normalize(value) !== value) addError(location, 'must be normalized')
  return true
}

function validateReview(value, location, localItemIds) {
  if (!isObject(value)) {
    addError(location, 'must be an object')
    return
  }
  requireString(value.status, `${location}.status`)
  optionalStringOrNull(value.preferredItemId, `${location}.preferredItemId`)
  optionalStringOrNull(value.notes, `${location}.notes`)
  if (typeof value.preferredItemId === 'string' && !localItemIds.has(value.preferredItemId.toLowerCase())) {
    addError(`${location}.preferredItemId`, 'must reference an item in the same family')
  }
}

function validateProvenance(value, location) {
  if (!isObject(value)) {
    addError(location, 'must be an object')
    return
  }
  requireString(value.status, `${location}.status`)
  requireString(value.source, `${location}.source`)
}

function validateRights(value, location) {
  if (!isObject(value)) {
    addError(location, 'must be an object')
    return
  }
  requireString(value.status, `${location}.status`)
  optionalStringOrNull(value.owner, `${location}.owner`)
  optionalStringOrNull(value.license, `${location}.license`)
  optionalStringOrNull(value.notes, `${location}.notes`)
}

async function loadManifest() {
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch (error) {
    addError('manifest', error instanceof Error ? error.message : String(error))
    return null
  }
}

function validateManifest(manifest) {
  if (!isObject(manifest)) {
    addError('manifest', 'must be a JSON object')
    return
  }
  if (manifest.schema !== 'doughforge.reference-corpus-manifest') {
    addError('schema', 'must equal "doughforge.reference-corpus-manifest"')
  }
  if (manifest.version !== 1) addError('version', 'must equal 1')
  if (manifest.referenceRootEnvironmentVariable !== 'DOUGHFORGE_REFERENCE_ROOT') {
    addError('referenceRootEnvironmentVariable', 'must equal "DOUGHFORGE_REFERENCE_ROOT"')
  }
  if (!isObject(manifest.sourceInventory)) addError('sourceInventory', 'must be an object')
  if (!isObject(manifest.splitPolicy)) addError('splitPolicy', 'must be an object')
  if (!Array.isArray(manifest.families) || manifest.families.length === 0) {
    addError('families', 'must be a non-empty array')
    return
  }

  const familyIds = new Set()
  const itemIds = new Set()
  const assetPaths = new Set()

  manifest.families.forEach((family, familyIndex) => {
    const location = `families[${familyIndex}]`
    if (!isObject(family)) {
      addError(location, 'must be an object')
      return
    }
    if (requireString(family.id, `${location}.id`)) {
      const key = family.id.toLowerCase()
      if (familyIds.has(key)) addError(`${location}.id`, `duplicate family ID "${family.id}"`)
      familyIds.add(key)
    }
    requireString(family.label, `${location}.label`)
    if (!SPLITS.has(family.split)) addError(`${location}.split`, 'must be development or held-out')
    if (!MODES.has(family.generationMode)) addError(`${location}.generationMode`, 'is unsupported')
    if (!MODE_STATUSES.has(family.generationModeStatus)) {
      addError(`${location}.generationModeStatus`, 'is unsupported')
    }
    if (!Array.isArray(family.items) || family.items.length === 0) {
      addError(`${location}.items`, 'must be a non-empty array')
      return
    }

    const localItemIds = new Set()
    family.items.forEach((item, itemIndex) => {
      const itemLocation = `${location}.items[${itemIndex}]`
      if (!isObject(item)) {
        addError(itemLocation, 'must be an object')
        return
      }
      if (requireString(item.id, `${itemLocation}.id`)) {
        const key = item.id.toLowerCase()
        if (itemIds.has(key)) addError(`${itemLocation}.id`, `duplicate item ID "${item.id}"`)
        itemIds.add(key)
        localItemIds.add(key)
      }
      if (validateSafeRelativePath(item.path, `${itemLocation}.path`)) {
        const key = item.path.toLowerCase()
        if (assetPaths.has(key)) addError(`${itemLocation}.path`, `duplicate asset path "${item.path}"`)
        assetPaths.add(key)
        assets.push({ location: `${itemLocation}.path`, relativePath: item.path })
      }
      if (!ROLES.has(item.role)) addError(`${itemLocation}.role`, 'is unsupported')
      if (!FORMATS.has(item.format)) addError(`${itemLocation}.format`, 'is unsupported')
      if (!UNITS.has(item.units)) addError(`${itemLocation}.units`, 'is unsupported')
      if (typeof item.path === 'string' && typeof item.format === 'string') {
        const extension = path.posix.extname(item.path).slice(1).toLowerCase()
        if (extension !== item.format.toLowerCase()) {
          addError(`${itemLocation}.format`, `does not match .${extension || '(none)'}`)
        }
      }
    })

    validateReview(family.review, `${location}.review`, localItemIds)
    validateProvenance(family.provenance, `${location}.provenance`)
    validateRights(family.rights, `${location}.rights`)
  })
}

function isWithinRoot(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
}

async function checkExternalAssets(rootValue) {
  let root
  try {
    root = await realpath(path.resolve(rootValue))
    const rootStats = await stat(root)
    if (!rootStats.isDirectory()) throw new Error('is not a directory')
  } catch (error) {
    addError('DOUGHFORGE_REFERENCE_ROOT', error instanceof Error ? error.message : String(error))
    return
  }

  for (const asset of assets) {
    const candidate = path.resolve(root, ...asset.relativePath.split('/'))
    if (!isWithinRoot(root, candidate)) {
      addError(asset.location, 'resolves outside DOUGHFORGE_REFERENCE_ROOT')
      continue
    }
    try {
      const canonical = await realpath(candidate)
      if (!isWithinRoot(root, canonical)) {
        addError(asset.location, 'resolves through a link outside DOUGHFORGE_REFERENCE_ROOT')
        continue
      }
      const fileStats = await stat(canonical)
      if (!fileStats.isFile()) addError(asset.location, 'does not resolve to a file')
    } catch (error) {
      addError(asset.location, `external file check failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

const manifest = await loadManifest()
if (manifest) validateManifest(manifest)

const externalRoot = process.env.DOUGHFORGE_REFERENCE_ROOT
if (externalRoot && errors.length === 0) await checkExternalAssets(externalRoot)

if (errors.length > 0) {
  console.error(`Reference manifest validation failed with ${errors.length} error(s):`)
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  const familyCount = Array.isArray(manifest?.families) ? manifest.families.length : 0
  const fileStatus = externalRoot ? `${assets.length} external files checked` : 'external files not checked'
  console.log(`Reference manifest valid: ${familyCount} families, ${assets.length} items; ${fileStatus}.`)
}
