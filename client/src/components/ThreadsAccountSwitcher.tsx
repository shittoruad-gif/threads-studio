import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { ChevronDown, User, Link2, AlertCircle } from 'lucide-react';
import { useState, useRef, useEffect, createContext, useContext, type ReactNode } from 'react';
import { useLocation } from 'wouter';

// --- Context for global selected account ---
interface ThreadsAccountContextType {
  selectedAccountId: number | null;
  setSelectedAccountId: (id: number | null) => void;
  selectedAccount: ThreadsAccountInfo | null;
  accounts: ThreadsAccountInfo[];
  isLoading: boolean;
}

interface ThreadsAccountInfo {
  id: number;
  threadsUsername: string;
  threadsUserId: string;
  profilePictureUrl: string | null;
  tokenExpiresAt: Date | string | null;
}

const ThreadsAccountContext = createContext<ThreadsAccountContextType>({
  selectedAccountId: null,
  setSelectedAccountId: () => {},
  selectedAccount: null,
  accounts: [],
  isLoading: false,
});

export function useThreadsAccount() {
  return useContext(ThreadsAccountContext);
}

export function ThreadsAccountProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);

  const { data: accounts, isLoading } = trpc.threads.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // Auto-select first account if none selected
  useEffect(() => {
    if (accounts && accounts.length > 0 && selectedAccountId === null) {
      setSelectedAccountId(accounts[0].id);
    }
    // If selected account was removed, reset
    if (accounts && selectedAccountId !== null && !accounts.find(a => a.id === selectedAccountId)) {
      setSelectedAccountId(accounts.length > 0 ? accounts[0].id : null);
    }
  }, [accounts, selectedAccountId]);

  const selectedAccount = accounts?.find(a => a.id === selectedAccountId) || null;

  return (
    <ThreadsAccountContext.Provider value={{
      selectedAccountId,
      setSelectedAccountId,
      selectedAccount: selectedAccount as ThreadsAccountInfo | null,
      accounts: (accounts || []) as ThreadsAccountInfo[],
      isLoading,
    }}>
      {children}
    </ThreadsAccountContext.Provider>
  );
}

// --- Dropdown Switcher Component ---
interface ThreadsAccountSwitcherProps {
  compact?: boolean;
  className?: string;
}

export default function ThreadsAccountSwitcher({ compact = false, className = '' }: ThreadsAccountSwitcherProps) {
  const { selectedAccountId, setSelectedAccountId, selectedAccount, accounts, isLoading } = useThreadsAccount();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Check token expiry
  const getTokenStatus = (account: ThreadsAccountInfo) => {
    if (!account.tokenExpiresAt) return 'unknown';
    const expiresAt = new Date(account.tokenExpiresAt);
    const now = new Date();
    const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 0) return 'expired';
    if (daysLeft <= 7) return 'expiring';
    return 'valid';
  };

  if (isLoading) {
    return (
      <div className={`animate-pulse h-10 bg-muted rounded-lg ${compact ? 'w-32' : 'w-48'} ${className}`} />
    );
  }

  if (!accounts || accounts.length === 0) {
    return (
      <button
        onClick={() => setLocation('/threads-connect')}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border hover:bg-muted transition-colors text-muted-foreground text-sm ${className}`}
      >
        <Link2 className="w-4 h-4" />
        <span>アカウント未連携</span>
      </button>
    );
  }

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border hover:bg-muted transition-colors ${
          compact ? 'min-w-0' : 'min-w-[180px]'
        }`}
      >
        {selectedAccount?.profilePictureUrl ? (
          <img
            src={selectedAccount.profilePictureUrl}
            alt={`${selectedAccount.threadsUsername}のプロフィール画像`}
            className="w-6 h-6 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <User className="w-3 h-3 text-emerald-600" />
          </div>
        )}
        <span className="text-foreground/80 text-sm truncate">
          {selectedAccount ? `@${selectedAccount.threadsUsername}` : 'アカウントを選択'}
        </span>
        {(() => {
          if (!selectedAccount) return null;
          const status = getTokenStatus(selectedAccount);
          if (status === 'expired') return <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />;
          if (status === 'expiring') return <AlertCircle className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />;
          return null;
        })()}
        <ChevronDown className={`w-4 h-4 text-muted-foreground/60 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-border rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="p-2">
            <p className="text-muted-foreground/60 text-xs px-2 py-1 uppercase tracking-wider">アカウント切替</p>
            {accounts.map((account) => {
              const tokenStatus = getTokenStatus(account);
              const isSelected = account.id === selectedAccountId;
              return (
                <button
                  key={account.id}
                  onClick={() => {
                    setSelectedAccountId(account.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    isSelected
                      ? 'bg-emerald-50 border border-emerald-200'
                      : 'hover:bg-muted/50 border border-transparent'
                  }`}
                >
                  {account.profilePictureUrl ? (
                    <img
                      src={account.profilePictureUrl}
                      alt={`${account.threadsUsername}のプロフィール画像`}
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-emerald-600" />
                    </div>
                  )}
                  <div className="flex-1 text-left min-w-0">
                    <p className={`text-sm truncate ${isSelected ? 'text-foreground font-medium' : 'text-foreground/80'}`}>
                      @{account.threadsUsername}
                    </p>
                    {tokenStatus === 'expired' && (
                      <p className="text-red-500 text-xs">トークン期限切れ</p>
                    )}
                    {tokenStatus === 'expiring' && (
                      <p className="text-yellow-600 text-xs">トークン期限間近</p>
                    )}
                  </div>
                  {isSelected && (
                    <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
          <div className="border-t border-border/50 p-2">
            <button
              onClick={() => {
                setIsOpen(false);
                setLocation('/threads-connect');
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground text-sm"
            >
              <Link2 className="w-4 h-4" />
              <span>アカウント管理</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
