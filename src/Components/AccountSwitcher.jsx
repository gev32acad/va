import React, { useState, useEffect } from 'react'
import Swal from 'sweetalert2'
import { BsPersonFill, BsPlayFill, BsTrash, BsDownload } from 'react-icons/bs'

const AccountSwitcher = () => {
  const { ipcRenderer } = window.require('electron')
  const [accounts, setAccounts] = useState([])
  const [importing, setImporting] = useState(false)
  const [launching, setLaunching] = useState(null)

  useEffect(() => {
    const handleAccounts = (_, accs) => setAccounts(accs)
    ipcRenderer.on('accountSwitcher:accounts', handleAccounts)
    ipcRenderer.send('accountSwitcher:getAccounts')
    return () => ipcRenderer.removeListener('accountSwitcher:accounts', handleAccounts)
  }, [ipcRenderer])

  const importAccount = () => {
    setImporting(true)
    ipcRenderer.send('accountSwitcher:import')
    ipcRenderer.once('accountSwitcher:importResult', (_, result) => {
      setImporting(false)
      if (result.success) {
        setAccounts(result.accounts)
        Swal.fire({ icon: 'success', text: 'Account imported!', toast: true, position: 'top-end', background: '#141418', color: '#f0f0f8', showConfirmButton: false, timer: 2500, iconColor: '#ff4655' })
      } else {
        Swal.fire({ icon: 'error', text: result.error, toast: true, position: 'top-end', background: '#141418', color: '#f0f0f8', showConfirmButton: false, timer: 3500, iconColor: '#ff4655' })
      }
    })
  }

  const launchAccount = (puuid) => {
    setLaunching(puuid)
    ipcRenderer.send('accountSwitcher:launch', puuid)
    ipcRenderer.once('accountSwitcher:launchResult', (_, result) => {
      setLaunching(null)
      if (result.success) {
        Swal.fire({ icon: 'success', text: 'Switching account — Riot Client is starting...', toast: true, position: 'top-end', background: '#141418', color: '#f0f0f8', showConfirmButton: false, timer: 3000, iconColor: '#ff4655' })
      } else {
        Swal.fire({ icon: 'error', text: result.error || 'Launch failed.', toast: true, position: 'top-end', background: '#141418', color: '#f0f0f8', showConfirmButton: false, timer: 3500, iconColor: '#ff4655' })
      }
    })
  }

  const deleteAccount = (puuid, name) => {
    Swal.fire({
      title: `Remove ${name}?`,
      text: 'The saved session will be deleted.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff4655',
      cancelButtonColor: '#22222e',
      background: '#141418',
      color: '#f0f0f8',
      confirmButtonText: 'Remove'
    }).then(result => {
      if (result.isConfirmed) {
        ipcRenderer.send('accountSwitcher:delete', puuid)
      }
    })
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: 24, gap: 16, overflowY: 'auto' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h2 className='brand-font' style={{ fontSize: 18, letterSpacing: 3, color: '#f0f0f8', margin: 0 }}>ACCOUNTS</h2>
          <p style={{ fontSize: 11, color: '#38384e', margin: '4px 0 0', letterSpacing: 1 }}>Import & switch between accounts</p>
        </div>
        <ImportBtn importing={importing} onClick={importAccount} />
      </div>

      {accounts.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <BsPersonFill size={40} style={{ color: '#252530' }} />
          <p style={{ color: '#38384e', fontSize: 13, margin: 0 }}>No accounts saved yet</p>
          <p style={{ color: '#252530', fontSize: 11, margin: 0, textAlign: 'center', lineHeight: 1.6 }}>
            Make sure Valorant is running,<br />then click &quot;Import Current&quot;
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {accounts.map(account => (
            <AccountCard
              key={account.puuid}
              account={account}
              isLaunching={launching === account.puuid}
              onLaunch={() => launchAccount(account.puuid)}
              onDelete={() => deleteAccount(account.puuid, account.gameName)}
            />
          ))}
        </div>
      )}

    </div>
  )
}

function ImportBtn({ importing, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={importing}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className='NoDrag'
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, background: importing ? '#1e1e28' : hov ? '#ff6170' : '#ff4655', color: importing ? '#44445e' : '#fff', border: 'none', cursor: importing ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, letterSpacing: 1.5, transition: 'all 0.15s', flexShrink: 0 }}>
      <BsDownload size={13} />
      {importing ? 'IMPORTING...' : 'IMPORT CURRENT'}
    </button>
  )
}

function AccountCard({ account, isLaunching, onLaunch, onDelete }) {
  const [launchHov, setLaunchHov] = useState(false)
  const [deleteHov, setDeleteHov] = useState(false)
  return (
    <div style={{ background: '#111116', border: '1px solid #1e1e28', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,70,85,0.08)', border: '1px solid rgba(255,70,85,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <BsPersonFill size={18} style={{ color: '#ff4655' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#f0f0f8', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.gameName}</p>
        <p style={{ fontSize: 11, color: '#44445e', margin: 0, letterSpacing: 1 }}>#{account.tagLine}</p>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          onClick={onLaunch}
          disabled={isLaunching}
          onMouseEnter={() => setLaunchHov(true)}
          onMouseLeave={() => setLaunchHov(false)}
          className='NoDrag'
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: isLaunching ? '#1e1e28' : launchHov ? '#ff6170' : '#ff4655', color: isLaunching ? '#44445e' : '#fff', border: 'none', cursor: isLaunching ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, transition: 'all 0.15s' }}>
          <BsPlayFill size={12} />
          {isLaunching ? '...' : 'Launch'}
        </button>
        <button
          onClick={onDelete}
          onMouseEnter={() => setDeleteHov(true)}
          onMouseLeave={() => setDeleteHov(false)}
          className='NoDrag'
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8, background: deleteHov ? 'rgba(255,70,85,0.1)' : '#18181e', border: `1px solid ${deleteHov ? 'rgba(255,70,85,0.3)' : '#252530'}`, color: deleteHov ? '#ff4655' : '#44445e', cursor: 'pointer', transition: 'all 0.15s' }}>
          <BsTrash size={13} />
        </button>
      </div>
    </div>
  )
}

export default AccountSwitcher
