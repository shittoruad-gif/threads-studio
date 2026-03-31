import { Heart, MessageCircle, Repeat2, Send, MoreHorizontal, Wifi, Battery, Signal } from 'lucide-react';

interface ThreadsPhonePreviewProps {
  mainPost: string;
  treePosts: string[];
  username?: string;
  profileImage?: string;
}

function PostContent({ text }: { text: string }) {
  const parts = text.split(/(\s+)/);
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith('#')) {
          return <span key={i} className="text-blue-500">{part}</span>;
        }
        if (part.startsWith('http://') || part.startsWith('https://')) {
          return <span key={i} className="text-blue-500 underline">{part}</span>;
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

function PhoneStatusBar() {
  return (
    <div className="flex items-center justify-between px-5 py-1.5 text-black text-[11px] font-semibold">
      <span>9:41</span>
      <div className="flex items-center gap-1">
        <Signal className="w-3.5 h-3.5" />
        <Wifi className="w-3.5 h-3.5" />
        <Battery className="w-4 h-4" />
      </div>
    </div>
  );
}

function ThreadsHeader() {
  return (
    <div className="flex items-center justify-center py-2 border-b border-gray-200">
      <svg className="w-6 h-6 text-black" viewBox="0 0 192 192" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.745C82.2364 44.745 69.7731 51.1399 62.102 62.7747L75.881 72.2765C81.6116 63.5951 90.3135 59.0251 97.2527 59.0251C97.3322 59.0251 97.4123 59.0251 97.4917 59.0258C104.632 59.0738 110.202 61.2779 114.126 65.5849C116.982 68.7449 118.996 73.0089 120.141 78.3249C113.258 77.1249 105.786 76.6769 97.7527 76.9899C73.0527 77.9449 56.7527 93.5649 57.8527 114.645C58.4127 125.345 63.8527 134.685 73.0527 140.835C80.8527 145.995 90.7527 148.525 101.053 147.935C114.353 147.165 124.853 141.485 131.953 131.135C137.253 123.355 140.653 113.385 142.253 100.925C148.233 104.555 152.623 109.345 155.053 115.165C159.253 125.175 159.553 141.835 147.553 153.835C137.053 164.335 124.553 169.335 97.2527 169.535C66.9527 169.315 44.5527 159.335 29.5527 139.835C15.6527 121.835 8.25273 96.6349 8.05273 65.0349C8.25273 33.4349 15.6527 8.23486 29.5527 -9.76514C44.5527 -29.2651 66.9527 -39.2451 97.2527 -39.4651C127.753 -39.2451 150.353 -29.1651 165.653 -9.46514C173.153 0.234856 178.753 12.1349 182.353 26.0349L197.053 22.2349C192.853 6.23486 186.053 -7.56514 177.053 -19.2651C159.253 -42.3651 132.553 -54.4651 97.3527 -54.6651H97.1527C62.0527 -54.4651 35.5527 -42.2651 18.0527 -18.8651C1.85273 2.53486 -6.84727 31.0349 -7.04727 65.0349V65.1349C-6.84727 99.1349 1.85273 127.635 18.0527 149.035C35.5527 172.435 62.0527 184.635 97.1527 184.835H97.3527C128.553 184.635 144.553 177.835 157.553 164.835C174.053 148.335 173.353 126.335 167.553 112.535C163.353 102.535 154.553 94.4349 141.553 88.9849L141.537 88.9883ZM99.9527 133.035C87.5527 133.735 72.9527 128.235 72.1527 114.935C71.5527 104.635 79.0527 93.0349 98.0527 92.2349C100.553 92.1249 103.003 92.0749 105.403 92.0749C111.503 92.0749 117.253 92.6349 122.553 93.7349C120.453 122.935 109.753 132.535 99.9527 133.035Z" />
      </svg>
    </div>
  );
}

function SinglePhonePost({
  username,
  profileImage,
  content,
  showActions = true,
  showThread = false,
}: {
  username: string;
  profileImage?: string;
  content: string;
  showActions?: boolean;
  showThread?: boolean;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex gap-3">
        {/* Avatar + thread line */}
        <div className="flex flex-col items-center flex-shrink-0">
          {profileImage ? (
            <img
              src={profileImage}
              alt={`${username}のプロフィール画像`}
              className="w-9 h-9 rounded-full object-cover"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
              <span className="text-sm font-semibold text-gray-500">
                {username.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          {showThread && (
            <div className="w-0.5 flex-1 mt-2 mb-1 bg-gray-300 rounded-full min-h-[16px]" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between mb-0.5">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-[15px] text-black">
                {username}
              </span>
              <span className="text-[13px] text-gray-400">
                たった今
              </span>
            </div>
            <button className="p-1 text-gray-400">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          {/* Post body */}
          <div className="text-[15px] leading-[1.5] text-black whitespace-pre-wrap break-words overflow-hidden">
            <PostContent text={content} />
          </div>

          {/* Actions */}
          {showActions && (
            <div className="flex items-center gap-4 mt-3">
              <Heart className="w-[19px] h-[19px] text-gray-500" strokeWidth={1.5} />
              <MessageCircle className="w-[19px] h-[19px] text-gray-500" strokeWidth={1.5} />
              <Repeat2 className="w-[19px] h-[19px] text-gray-500" strokeWidth={1.5} />
              <Send className="w-[18px] h-[18px] text-gray-500" strokeWidth={1.5} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ThreadsPhonePreview({
  mainPost,
  treePosts,
  username = 'あなたのアカウント',
  profileImage,
}: ThreadsPhonePreviewProps) {
  const allPosts = [mainPost, ...treePosts.filter(p => p.trim())];
  const hasThread = allPosts.length > 1;

  return (
    <div className="flex justify-center w-full">
      {/* Phone frame */}
      <div className="w-full max-w-[375px] mx-auto">
        <div className="relative bg-white rounded-[3rem] border-[3px] border-gray-800 shadow-2xl overflow-hidden">
          {/* Notch */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120px] h-[28px] bg-gray-800 rounded-b-2xl z-10" />

          {/* Screen content */}
          <div className="pt-[28px]">
            {/* Status bar */}
            <PhoneStatusBar />

            {/* Threads header */}
            <ThreadsHeader />

            {/* Thread indicator */}
            {hasThread && (
              <div className="px-4 py-2 border-b border-gray-200 flex items-center gap-2">
                <div className="w-1 h-4 bg-black rounded-full" />
                <span className="text-xs font-medium text-black">スレッド</span>
                <span className="text-xs text-gray-400">{allPosts.length}件の投稿</span>
              </div>
            )}

            {/* Posts */}
            <div className="max-h-[500px] overflow-y-auto">
              {allPosts.map((post, index) => (
                <div key={index}>
                  <SinglePhonePost
                    username={username}
                    profileImage={profileImage}
                    content={post}
                    showActions={index === allPosts.length - 1}
                    showThread={index < allPosts.length - 1}
                  />
                  {index < allPosts.length - 1 && (
                    <div className="border-b border-gray-100" />
                  )}
                </div>
              ))}
            </div>

            {/* Bottom bar */}
            <div className="border-t border-gray-200 py-2 pb-6">
              <p className="text-[10px] text-center text-gray-400">
                プレビュー — 実際の表示と異なる場合があります
              </p>
            </div>

            {/* Home indicator */}
            <div className="flex justify-center pb-2">
              <div className="w-[134px] h-[5px] bg-gray-800 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
