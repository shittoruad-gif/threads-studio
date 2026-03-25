import { drizzle } from "drizzle-orm/mysql2";
import { templates } from "../drizzle/schema.js";

const db = drizzle(process.env.DATABASE_URL);

const templateData = [
  // 整体院・接骨院
  {
    title: "新規キャンペーン告知",
    description: "初回限定キャンペーンを告知するテンプレート",
    category: "clinic",
    content: "【初回限定キャンペーン】\\n\\n{{施術名}}が特別価格で体験できます！\\n\\n通常価格：{{通常価格}}円\\n→ 初回限定：{{キャンペーン価格}}円\\n\\n期間：{{期間}}\\n\\n{{店舗名}}では、{{特徴}}を大切にしています。\\n\\nご予約はプロフィールのリンクから→",
    previewText: "初回限定キャンペーンを告知して新規顧客を獲得",
    tags: "キャンペーン,初回限定,整体,接骨院",
    isPopular: true,
    isPremium: false,
  },
  {
    title: "お客様の声紹介",
    description: "実際のお客様の声を紹介するテンプレート",
    category: "clinic",
    content: "【お客様の声】\\n\\n「{{お客様の感想}}」\\n\\n{{年代}}・{{性別}}・{{お悩み}}\\n\\n{{店舗名}}では、一人ひとりのお悩みに寄り添った施術を心がけています。\\n\\n#{{地域名}}整体 #{{お悩みキーワード}}",
    previewText: "お客様の声で信頼感をアップ",
    tags: "お客様の声,実績,整体,接骨院",
    isPopular: false,
    isPremium: false,
  },
  
  // 美容サロン・エステ
  {
    title: "季節限定メニュー",
    description: "季節に合わせた限定メニューを紹介",
    category: "beauty",
    content: "【{{季節}}限定メニュー】\\n\\n{{メニュー名}}\\n{{価格}}円（{{施術時間}}分）\\n\\n{{メニューの特徴}}\\n\\nこんな方におすすめ：\\n✓ {{おすすめポイント1}}\\n✓ {{おすすめポイント2}}\\n✓ {{おすすめポイント3}}\\n\\nご予約はDMまたはプロフィールから→",
    previewText: "季節限定メニューで集客アップ",
    tags: "季節限定,メニュー,美容,エステ",
    isPopular: true,
    isPremium: false,
  },
  {
    title: "ビフォーアフター投稿",
    description: "施術前後の変化を紹介するテンプレート",
    category: "beauty",
    content: "【ビフォーアフター】\\n\\n{{施術名}}の結果をご紹介✨\\n\\n施術内容：{{施術内容}}\\n施術時間：{{施術時間}}\\n\\n{{お客様のコメント}}\\n\\n{{店舗名}}では、{{こだわりポイント}}にこだわっています。\\n\\n#{{地域名}}美容 #{{施術名}}",
    previewText: "ビフォーアフターで効果を実感",
    tags: "ビフォーアフター,実績,美容,エステ",
    isPopular: true,
    isPremium: false,
  },
  
  // 飲食店・カフェ
  {
    title: "新メニュー紹介",
    description: "新しいメニューを魅力的に紹介",
    category: "restaurant",
    content: "【新メニュー登場】\\n\\n{{メニュー名}}\\n{{価格}}円\\n\\n{{メニューの説明}}\\n\\n使用食材：{{食材}}\\nこだわりポイント：{{こだわり}}\\n\\n期間限定なのでお早めに！\\n\\n#{{地域名}}グルメ #{{ジャンル}}",
    previewText: "新メニューで来店を促進",
    tags: "新メニュー,飲食店,カフェ,レストラン",
    isPopular: true,
    isPremium: false,
  },
  {
    title: "ランチタイム告知",
    description: "ランチタイムの営業情報を告知",
    category: "restaurant",
    content: "【本日のランチ】\\n\\n{{メニュー名}}\\n{{価格}}円\\n\\n{{メニュー内容}}\\n\\n営業時間：{{営業時間}}\\nラストオーダー：{{ラストオーダー}}\\n\\n{{店舗名}}でお待ちしております！\\n\\n#{{地域名}}ランチ #{{ジャンル}}",
    previewText: "ランチタイムの集客に最適",
    tags: "ランチ,飲食店,カフェ,レストラン",
    isPopular: false,
    isPremium: false,
  },
  
  // ジム・フィットネス
  {
    title: "トレーニングTips",
    description: "役立つトレーニング情報を発信",
    category: "gym",
    content: "【トレーニングTips】\\n\\n{{トピック}}\\n\\n{{説明}}\\n\\nポイント：\\n✓ {{ポイント1}}\\n✓ {{ポイント2}}\\n✓ {{ポイント3}}\\n\\n{{店舗名}}では、一人ひとりに合わせたトレーニングプログラムをご提案しています。\\n\\n#{{地域名}}ジム #フィットネス",
    previewText: "トレーニング情報で専門性をアピール",
    tags: "トレーニング,フィットネス,ジム,運動",
    isPopular: false,
    isPremium: false,
  },
  {
    title: "会員様の成果報告",
    description: "会員様の成果を紹介して信頼感を構築",
    category: "gym",
    content: "【会員様の成果】\\n\\n{{期間}}で{{成果}}を達成！\\n\\n{{年代}}・{{性別}}\\n目標：{{目標}}\\n\\n取り組んだこと：\\n・{{取り組み1}}\\n・{{取り組み2}}\\n・{{取り組み3}}\\n\\nあなたも理想の体を手に入れませんか？\\n\\n#{{地域名}}ジム #ダイエット",
    previewText: "会員様の成果で信頼性をアップ",
    tags: "成果,実績,ジム,フィットネス",
    isPopular: true,
    isPremium: false,
  },
  
  // ネイルサロン
  {
    title: "デザイン紹介",
    description: "最新のネイルデザインを紹介",
    category: "nail",
    content: "【新作デザイン】\\n\\n{{デザイン名}}\\n{{価格}}円\\n\\n{{デザインの説明}}\\n\\nカラー：{{カラー}}\\nデザイン時間：{{施術時間}}\\n\\nこんな方におすすめ：\\n{{おすすめポイント}}\\n\\n#{{地域名}}ネイル #ネイルデザイン",
    previewText: "最新デザインで予約を獲得",
    tags: "デザイン,ネイル,ネイルサロン",
    isPopular: true,
    isPremium: false,
  },
  
  // 汎用テンプレート
  {
    title: "定休日・営業時間変更のお知らせ",
    description: "営業情報の変更を告知",
    category: "general",
    content: "【お知らせ】\\n\\n{{変更内容}}\\n\\n変更日：{{変更日}}\\n{{詳細}}\\n\\nご不便をおかけしますが、よろしくお願いいたします。\\n\\n{{店舗名}}",
    previewText: "営業情報の変更を確実に伝える",
    tags: "お知らせ,営業時間,定休日",
    isPopular: false,
    isPremium: false,
  },
  {
    title: "イベント告知",
    description: "店舗イベントを告知するテンプレート",
    category: "general",
    content: "【イベント開催】\\n\\n{{イベント名}}\\n\\n日時：{{日時}}\\n場所：{{場所}}\\n参加費：{{参加費}}\\n\\n{{イベント内容}}\\n\\n定員：{{定員}}名\\n申込締切：{{締切}}\\n\\nお申し込みはDMまたはプロフィールから→",
    previewText: "イベント集客に最適",
    tags: "イベント,告知,キャンペーン",
    isPopular: false,
    isPremium: false,
  },
];

async function seedTemplates() {
  try {
    console.log("Seeding templates...");
    
    for (const template of templateData) {
      await db.insert(templates).values(template);
      console.log(`✓ Created template: ${template.title}`);
    }
    
    console.log(`\\n✓ Successfully seeded ${templateData.length} templates!`);
    process.exit(0);
  } catch (error) {
    console.error("Error seeding templates:", error);
    process.exit(1);
  }
}

seedTemplates();
