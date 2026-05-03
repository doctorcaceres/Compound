import { SECTORS } from './format'

// Reusable sector dropdown. When the user picks "Other", a text input appears
// below it so they can type their actual industry. The caller controls both
// values (sector + sectorOther) so it can decide where to persist them.
function SectorPicker({
  value,
  otherValue,
  onChange,
  onOtherChange,
  className = 'sector-picker-select',
  otherClassName = 'sector-picker-other',
  otherPlaceholder = 'Type your industry…',
  showLabel = false,
}) {
  return (
    <div className="sector-picker">
      {showLabel && <label className="sector-picker-label">Sector</label>}
      <select
        className={className}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
      >
        {SECTORS.map(s => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      {value === 'other' && (
        <input
          className={otherClassName}
          type="text"
          value={otherValue || ''}
          onChange={e => onOtherChange(e.target.value)}
          placeholder={otherPlaceholder}
          maxLength={60}
        />
      )}
    </div>
  )
}

export default SectorPicker
