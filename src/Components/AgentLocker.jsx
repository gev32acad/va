import React, { useState, useEffect } from 'react'
import axios from 'axios'
import Swal from 'sweetalert2'

function AgentCard({ agent, selected, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      className='NoDrag'
      style={{ width: 'calc(20% - 7px)', background: selected ? 'rgba(255,70,85,0.12)' : hov ? '#161620' : '#111116', border: `1px solid ${selected ? '#ff4655' : hov ? '#2a2a38' : '#1a1a22'}`, borderRadius: 12, padding: 8, cursor: 'pointer', transition: 'all 0.15s', boxShadow: selected ? '0 0 0 1px rgba(255,70,85,0.25)' : 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ width: '100%', aspectRatio: '1', background: '#0d0d12', borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={agent.displayIconSmall} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <p style={{ fontSize: 11, color: selected ? '#ff4655' : '#606078', margin: 0, textAlign: 'center', fontWeight: selected ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{agent.displayName}</p>
    </div>
  )
}

function ToggleBtn({ on, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      className='NoDrag'
      style={{ padding: '7px 18px', borderRadius: 8, background: on ? '#ff4655' : hov ? '#1e1e28' : '#18181e', color: on ? '#fff' : '#60607a', border: `1px solid ${on ? '#ff4655' : '#252530'}`, cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.15s' }}>
      {on ? 'ON' : 'OFF'}
    </button>
  )
}

const AgentLocker = () => {
  const { ipcRenderer } = window.require('electron')
  const [agents, setAgents] = useState([])
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [enabled, setEnabled] = useState(false)
  const [search, setSearch] = useState('')
  const [saveHov, setSaveHov] = useState(false)

  useEffect(() => {
    axios.get('https://valorant-api.com/v1/agents?isPlayableCharacter=true').then(res => {
      setAgents(res.data.data)
    })

    const handleConfig = (_, cfg) => {
      if (cfg) {
        setSelectedAgent(cfg.agentUuid || null)
        setEnabled(cfg.enabled || false)
      }
    }
    ipcRenderer.on('agentLocker:config', handleConfig)
    ipcRenderer.send('agentLocker:getConfig')
    return () => ipcRenderer.removeListener('agentLocker:config', handleConfig)
  }, [ipcRenderer])

  const save = () => {
    if (enabled && !selectedAgent) {
      Swal.fire({ icon: 'warning', text: 'Please select an agent first.', toast: true, position: 'top-end', background: '#141418', color: '#f0f0f8', showConfirmButton: false, timer: 2500, iconColor: '#ff4655' })
      return
    }
    ipcRenderer.send('agentLocker:setConfig', { enabled, agentUuid: selectedAgent })
    Swal.fire({ icon: 'success', text: enabled ? 'Agent Locker enabled!' : 'Agent Locker disabled', toast: true, position: 'top-end', background: '#141418', color: '#f0f0f8', showConfirmButton: false, timer: 2000, iconColor: '#ff4655' })
  }

  const filtered = agents.filter(a => a.displayName.toLowerCase().includes(search.toLowerCase()))
  const selectedAgentData = agents.find(a => a.uuid === selectedAgent)

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: 20, gap: 14, overflow: 'hidden' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h2 className='brand-font' style={{ margin: 0, fontSize: 18, color: '#f0f0f8', letterSpacing: 3 }}>AGENT LOCKER</h2>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#38384e', letterSpacing: 1 }}>Auto-locks your agent when pre-game starts</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: enabled ? '#ff4655' : '#44445e', fontWeight: 600, letterSpacing: 1 }}>{enabled ? 'ENABLED' : 'DISABLED'}</span>
          <ToggleBtn on={enabled} onClick={() => setEnabled(v => !v)} />
        </div>
      </div>

      {selectedAgentData && (
        <div style={{ background: 'rgba(255,70,85,0.07)', border: '1px solid rgba(255,70,85,0.2)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <img src={selectedAgentData.displayIconSmall} style={{ width: 38, height: 38, borderRadius: 8, objectFit: 'cover' }} />
          <div>
            <p style={{ margin: 0, fontSize: 13, color: '#f0f0f8', fontWeight: 700 }}>{selectedAgentData.displayName}</p>
            <p style={{ margin: 0, fontSize: 11, color: '#606078' }}>{selectedAgentData.role?.displayName || 'Agent'}</p>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#ff4655', fontWeight: 700, letterSpacing: 1.5 }}>SELECTED</span>
        </div>
      )}

      <input value={search} onChange={e => setSearch(e.target.value)} className='NoDrag'
        style={{ width: '100%', background: '#111116', border: '1px solid #1e1e28', borderRadius: 24, padding: '8px 16px', color: '#f0f0f8', fontSize: 13, outline: 'none', flexShrink: 0 }}
        placeholder='Search agents...' />

      <div className='scroll-area' style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignContent: 'flex-start', flex: 1 }}>
        {filtered.map(agent => (
          <AgentCard key={agent.uuid} agent={agent}
            selected={selectedAgent === agent.uuid}
            onClick={() => setSelectedAgent(agent.uuid)} />
        ))}
      </div>

      <button onClick={save} onMouseEnter={() => setSaveHov(true)} onMouseLeave={() => setSaveHov(false)}
        className='NoDrag'
        style={{ padding: 11, borderRadius: 12, background: saveHov ? '#ff6170' : '#ff4655', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, letterSpacing: 2, transition: 'background 0.15s', flexShrink: 0 }}>
        SAVE
      </button>

    </div>
  )
}

export default AgentLocker
