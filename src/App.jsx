import { useState } from 'react'
import Auth from './Auth'
import Header from './Header'
import LeftSidebar from './LeftSidebar'
import Feed from './Feed'
import RightSidebar from './RightSidebar'
import Messaging from './Messaging'
import Network from './Network'
import DealRooms from './DealRooms'
import Profile from './Profile'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [activePage, setActivePage] = useState('feed')
  const [profileTarget, setProfileTarget] = useState(null)

  if (!user) {
    return <Auth onLogin={setUser} />
  }

  const openProfile = (person) => {
    setProfileTarget(person)
    setActivePage('profile')
  }

  const renderPage = () => {
    switch (activePage) {
      case 'messaging':
        return <Messaging user={user} />
      case 'network':
        return <Network user={user} onOpenProfile={openProfile} />
      case 'dealrooms':
        return <DealRooms user={user} />
      case 'profile':
        return <Profile user={user} target={profileTarget} onNavigate={setActivePage} />
      default:
        return (
          <div className="main-layout">
            <LeftSidebar user={user} />
            <Feed user={user} />
            <RightSidebar onOpenMessages={() => setActivePage('messaging')} onOpenDealRooms={() => setActivePage('dealrooms')} />
          </div>
        )
    }
  }

  return (
    <div className="app">
      <Header user={user} activePage={activePage} onNavigate={setActivePage} onOpenProfile={() => openProfile(null)} />
      {renderPage()}
    </div>
  )
}

export default App
