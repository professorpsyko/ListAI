import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import { createListing } from '../lib/api';
import { useListingStore } from '../store/listingStore';
import clsx from 'clsx';

function SideNavLink({
  to, children, end,
}: { to: string; children: React.ReactNode; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
          isActive
            ? 'bg-blue-50 text-blue-700'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
        )
      }
    >
      {children}
    </NavLink>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────────
function Icon({ path, className }: { path: string | string[]; className?: string }) {
  const paths = Array.isArray(path) ? path : [path];
  return (
    <svg className={clsx('w-4 h-4 flex-shrink-0', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {paths.map((d, i) => (
        <path key={i} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={d} />
      ))}
    </svg>
  );
}

export default function AppLayout() {
  const navigate = useNavigate();
  const reset = useListingStore((s) => s.reset);
  const setListingId = useListingStore((s) => s.setListingId);

  async function handleNewListing() {
    reset();
    const listing = await createListing();
    setListingId(listing.id);
    navigate(`/listing/${listing.id}/step/1`);
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="px-4 py-4 border-b border-gray-100">
          <NavLink to="/dashboard">
            <img src="/logo.png" alt="ListSamurai" className="h-7 w-auto" />
          </NavLink>
        </div>

        {/* New listing CTA */}
        <div className="px-3 pt-4 pb-2">
          <button
            onClick={handleNewListing}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            New Listing
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {/* Dashboard */}
          <SideNavLink to="/dashboard" end>
            <Icon path="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            Dashboard
          </SideNavLink>

          {/* Listings section */}
          <div className="pt-3 pb-1">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 mb-1">Listings</p>
            <div className="space-y-0.5">
              <SideNavLink to="/listings/active">
                <Icon path="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                Active
              </SideNavLink>
              <SideNavLink to="/listings/drafts">
                <Icon path="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                Drafts
              </SideNavLink>
              <SideNavLink to="/listings/scheduled">
                <Icon path="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                Scheduled
              </SideNavLink>
              <SideNavLink to="/listings/ended">
                <Icon path={['M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z']} />
                Ended
              </SideNavLink>
            </div>
          </div>

          {/* Other sections */}
          <div className="pt-3 pb-1">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 mb-1">Tools</p>
            <div className="space-y-0.5">
              <SideNavLink to="/segments">
                <Icon path="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                Custom Segments
              </SideNavLink>
              <SideNavLink to="/offers">
                <Icon path="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                Offers
              </SideNavLink>
              <SideNavLink to="/catalog">
                <Icon path={['M4 6h16M4 10h16M4 14h16M4 18h16']} />
                Item Catalog
              </SideNavLink>
            </div>
          </div>
        </nav>

        {/* Bottom: settings + user */}
        <div className="px-3 py-3 border-t border-gray-100 space-y-0.5">
          <SideNavLink to="/settings">
            <Icon path={['M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z', 'M15 12a3 3 0 11-6 0 3 3 0 016 0z']} />
            Settings
          </SideNavLink>
          <div className="flex items-center gap-2 px-3 py-2">
            <UserButton afterSignOutUrl="/sign-in" />
            <span className="text-xs text-gray-500 truncate">Account</span>
          </div>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
