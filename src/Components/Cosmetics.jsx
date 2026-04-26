import React, { useState, useEffect } from 'react'
import axios from 'axios'
import Swal from 'sweetalert2'

const TABS = ['Sprays', 'Gun Buddies']
const SLOT_LABELS = ['Pre-Round', 'Mid-Round', 'Post-Round']

const S = {
  search: { width: '100%', background: '#111116', border: '1px solid #1e1e28', borderRadius: 24, padding: '8px 16px', color: '#f0f0f8', fontSize: 13, outline: 'none' },
}

function Tab({ label, active, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      className='NoDrag'
      style={{ flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', border: 'none', background: active ? '#ff4655' : hov ? '#1e1e28' : '#111116', color: active ? '#fff' : hov ? '#c0c0d8' : '#50506a' }}>
      {label}
    </button>
  )
}

function WeaponBtn({ weapon, active, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      className='NoDrag'
      style={{ padding: '7px 10px', borderRadius: 8, background: active ? 'rgba(255,70,85,0.12)' : hov ? '#18181e' : 'transparent', borderLeft: `2px solid ${active ? '#ff4655' : 'transparent'}`, borderTop: 'none', borderRight: 'none', borderBottom: 'none', color: active ? '#ff4655' : hov ? '#c0c0d8' : '#44445e', transition: 'all 0.15s', cursor: 'pointer', textAlign: 'left', fontSize: 12, fontWeight: active ? 600 : 400 }}>
      {weapon.name}
    </button>
  )
}

function SprayCard({ spray, selected, onClick }) {
  const [hov, setHov] = useState(false)
  const icon = spray.fullDisplayIcon || spray.displayIcon
  return (
    <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      className='NoDrag'
      style={{ width: 'calc(25% - 6px)', background: selected ? 'rgba(255,70,85,0.12)' : hov ? '#161620' : '#111116', border: `1px solid ${selected ? '#ff4655' : hov ? '#2a2a38' : '#1a1a22'}`, borderRadius: 12, padding: 8, cursor: 'pointer', transition: 'all 0.15s', boxShadow: selected ? '0 0 0 1px rgba(255,70,85,0.3)' : 'none' }}>
      <div style={{ background: '#0d0d12', borderRadius: 8, padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 60 }}>
        <img src={icon} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      </div>
      <p style={{ fontSize: 10, color: '#606078', margin: '6px 0 0', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{spray.displayName}</p>
    </div>
  )
}

function SlotCard({ label, spray, active, onClick }) {
  const [hov, setHov] = useState(false)
  const icon = spray ? (spray.fullDisplayIcon || spray.displayIcon) : null
  return (
    <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      className='NoDrag'
      style={{ background: active ? 'rgba(255,70,85,0.1)' : hov ? '#161620' : '#111116', border: `1px solid ${active ? '#ff4655' : '#1a1a22'}`, borderRadius: 10, padding: '10px 10px', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 46, height: 46, background: '#0d0d12', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon ? <img src={icon} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: 18, color: '#252530' }}>?</span>}
      </div>
      <p style={{ fontSize: 10, color: active ? '#ff4655' : '#44445e', margin: 0, fontWeight: 600, letterSpacing: 1 }}>{label}</p>
    </div>
  )
}

function BuddyCard({ buddy, onEquip }) {
  const [hov, setHov] = useState(false)
  const [btnHov, setBtnHov] = useState(false)
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ width: 'calc(25% - 6px)', background: hov ? '#161620' : '#111116', border: `1px solid ${hov ? '#2a2a38' : '#1a1a22'}`, borderRadius: 12, padding: 8, display: 'flex', flexDirection: 'column', gap: 6, transition: 'all 0.15s' }}>
      <div style={{ background: '#0d0d12', borderRadius: 8, padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 60 }}>
        <img src={buddy.displayIcon} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      </div>
      <p style={{ fontSize: 10, color: '#606078', margin: 0, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{buddy.displayName}</p>
      <button onClick={onEquip} onMouseEnter={() => setBtnHov(true)} onMouseLeave={() => setBtnHov(false)}
        className='NoDrag'
        style={{ width: '100%', padding: '5px', borderRadius: 7, background: btnHov ? '#ff4655' : '#18181e', border: `1px solid ${btnHov ? '#ff4655' : '#252530'}`, color: btnHov ? '#fff' : '#50506a', fontSize: 10, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
        EQUIP
      </button>
    </div>
  )
}

const Cosmetics = () => {
  const { ipcRenderer } = window.require('electron')
  const [tab, setTab] = useState(0)

  // Sprays
  const [sprays, setSprays] = useState([])
  const [selectedSprays, setSelectedSprays] = useState([null, null, null])
  const [activeSlot, setActiveSlot] = useState(0)
  const [spraySearch, setSpraySearch] = useState('')

  // Buddies
  const [buddies, setBuddies] = useState([])
  const [weapons, setWeapons] = useState([])
  const [selectedWeapon, setSelectedWeapon] = useState(null)
  const [buddySearch, setBuddySearch] = useState('')

  useEffect(() => {
    axios.get('https://valorant-api.com/v1/sprays').then(res => {
      setSprays(res.data.data.filter(s => s.fullDisplayIcon || s.displayIcon))
    })
    axios.get('https://valorant-api.com/v1/buddies').then(res => {
      setBuddies(res.data.data.filter(b => b.displayIcon))
    })
    axios.get('https://valorant-api.com/v1/weapons').then(res => {
      const guns = res.data.data.map(w => ({ uuid: w.uuid, name: w.displayName, icon: w.displayIcon }))
      setWeapons(guns)
      setSelectedWeapon(guns[0]?.uuid || null)
    })
  }, [])

  const equipSprays = () => {
    ipcRenderer.send('equipSprays', selectedSprays)
    Swal.fire({ icon: 'success', text: 'Sprays equipped!', toast: true, position: 'top-end', background: '#141418', color: '#f0f0f8', showConfirmButton: false, timer: 2500, iconColor: '#ff4655' })
  }

  const equipBuddy = (buddy) => {
    ipcRenderer.send('equipBuddy', { gunUuid: selectedWeapon, buddyUuid: buddy.uuid, buddyLevelUuid: buddy.levels?.[0]?.uuid ?? null })
    Swal.fire({ icon: 'success', text: `Buddy equipped: ${buddy.displayName}`, toast: true, position: 'top-end', background: '#141418', color: '#f0f0f8', showConfirmButton: false, timer: 2500, iconColor: '#ff4655' })
  }

  const filteredSprays = sprays.filter(s => s.displayName.toLowerCase().includes(spraySearch.toLowerCase()))
  const filteredBuddies = buddies.filter(b => b.displayName.toLowerCase().includes(buddySearch.toLowerCase()))
  const currentWeapon = weapons.find(w => w.uuid === selectedWeapon)

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: 20, gap: 14, overflow: 'hidden' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '7px 16px', background: 'rgba(255,70,85,0.08)', border: '1px solid rgba(255,70,85,0.18)', borderRadius: 10, flexShrink: 0 }}>
        <span style={{ color: '#ff4655', fontSize: 11 }}>⚠</span>
        <span style={{ color: '#c0a0a4', fontSize: 11, letterSpacing: 0.5 }}>These changes require a game restart to take effect</span>
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {TABS.map((t, i) => <Tab key={i} label={t} active={tab === i} onClick={() => { setTab(i); setSpraySearch(''); setBuddySearch('') }} />)}
      </div>

      {tab === 0 && (
        <div style={{ display: 'flex', gap: 14, flex: 1, overflow: 'hidden' }}>
          <div style={{ width: 110, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SLOT_LABELS.map((label, i) => (
              <SlotCard key={i} label={label}
                spray={sprays.find(s => s.uuid === selectedSprays[i]) || null}
                active={activeSlot === i}
                onClick={() => setActiveSlot(i)} />
            ))}
            <button onClick={equipSprays} className='NoDrag'
              style={{ marginTop: 'auto', padding: '10px', borderRadius: 10, background: '#ff4655', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, transition: 'background 0.15s' }}>
              EQUIP
            </button>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
            <div style={{ flexShrink: 0 }}>
              <p style={{ margin: '0 0 6px', fontSize: 11, color: '#44445e', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                Slot: <span style={{ color: '#ff4655' }}>{SLOT_LABELS[activeSlot]}</span>
              </p>
              <input value={spraySearch} onChange={e => setSpraySearch(e.target.value)} className='NoDrag'
                style={S.search} placeholder='Search sprays...' />
            </div>
            <div className='scroll-area' style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignContent: 'flex-start' }}>
              {filteredSprays.map(spray => (
                <SprayCard key={spray.uuid} spray={spray}
                  selected={selectedSprays[activeSlot] === spray.uuid}
                  onClick={() => setSelectedSprays(prev => { const next = [...prev]; next[activeSlot] = spray.uuid; return next })} />
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 1 && (
        <div style={{ display: 'flex', gap: 0, flex: 1, overflow: 'hidden' }}>
          <div className='scroll-area' style={{ width: 130, flexShrink: 0, borderRight: '1px solid #1a1a22', padding: '0 6px 0 0', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {weapons.map(w => (
              <WeaponBtn key={w.uuid} weapon={w} active={selectedWeapon === w.uuid}
                onClick={() => { setSelectedWeapon(w.uuid); setBuddySearch('') }} />
            ))}
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden', paddingLeft: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <p className='brand-font' style={{ margin: 0, fontSize: 15, color: '#f0f0f8', letterSpacing: 2 }}>{currentWeapon?.name}</p>
              {currentWeapon?.icon && <img src={currentWeapon.icon} style={{ height: 28, objectFit: 'contain', opacity: 0.4 }} />}
            </div>
            <input value={buddySearch} onChange={e => setBuddySearch(e.target.value)} className='NoDrag'
              style={S.search} placeholder='Search buddies...' />
            <div className='scroll-area' style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignContent: 'flex-start' }}>
              {filteredBuddies.map(buddy => (
                <BuddyCard key={buddy.uuid} buddy={buddy} onEquip={() => equipBuddy(buddy)} />
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default Cosmetics
