/* Admin Panel Mock Data */
import { IC } from './icons.js';

export const MOCK = {
  stats: {
    totalUsers:    { value: 18529, delta: '+12.4%', sub: 'vs last 30 days' },
    totalMeetings: { value: 154, live: 12, upcoming: 34, past: 108 },
    questions:     { value: 45782, delta: '+15.3%', sub: 'vs last 30 days' },
    votes:         { value: 128916, delta: '+18.6%', sub: 'vs last 30 days' },
  },
  liveMeetings: [
    { id:1, title:'AI in Education Summit',   host:'Dr. Priya Sharma', participants:228, extra:207, questions:32, liveFor:'00:42:18', pending:12, review:8,  answered:12 },
    { id:2, title:'Future of Work Webinar',   host:'Rahul Verma',      participants:172, extra:151, questions:18, liveFor:'00:35:09', pending:6,  review:5,  answered:7  },
    { id:3, title:'Startup Pitch Session',    host:'Vikram Patel',     participants:78,  extra:69,  questions:9,  liveFor:'00:18:33', pending:3,  review:2,  answered:4  },
    { id:4, title:'Tech Innovators Meet',     host:'Ananya Iyer',      participants:63,  extra:54,  questions:14, liveFor:'00:27:45', pending:5,  review:8,  answered:6  },
    { id:5, title:'Research Roundtable',      host:'Neha Kulkarni',    participants:45,  extra:38,  questions:7,  liveFor:'00:15:12', pending:2,  review:1,  answered:4  },
    { id:6, title:'Marketing Masters Live',   host:'Siddharth Jain',   participants:32,  extra:26,  questions:5,  liveFor:'00:09:47', pending:1,  review:1,  answered:3  },
  ],
  chartData: [
    { label:'10 Jul', value:4300 }, { label:'11 Jul', value:6100 }, { label:'12 Jul', value:5200 },
    { label:'13 Jul', value:8700 }, { label:'14 Jul', value:7400 }, { label:'15 Jul', value:6800 },
    { label:'16 Jul', value:7100 },
  ],
  health: { uptime:'99.98%', uptimeSub:'30 days', memory:'62.4%', memorySub:'of 16 GB', db:'Healthy', dbSub:'PostgreSQL' },

  meetings: [
    { id:1,  title:'AI in Education Summit',     owner:'Priya Sharma',   ownerInit:'PS', status:'live',       code:'CV-48291', questions:32, participants:228, created:'12 Jan 2024',
      desc:'A summit bringing together educators, researchers, and technologists to discuss AI-driven learning, classroom innovation, and the future of education.',
      settings:{ allowQ:true, upvotes:true, chat:true, clustering:true, record:false, reactions:true },
      questions_data:[
        { text:'How can AI personalize learning experiences…', status:'pending',      votes:42, similar:7  },
        { text:'What are the key ethical concerns in AI…',     status:'under_review',  votes:38, similar:5  },
        { text:'Best practices for implementing AI in…',       status:'answered',      votes:51, similar:12 },
        { text:'How will AI impact traditional assessment…',   status:'answered',      votes:27, similar:4  },
      ],
      polls:[
        { q:'Which AI tool do you use most often?', status:'active',  options:[{l:'ChatGPT',pct:45,n:92},{l:'Google Gemini',pct:28,n:58},{l:'Microsoft Copilot',pct:17,n:35},{l:'Others',pct:10,n:21}] },
        { q:'Should AI be part of core curriculum?',status:'closed', options:[{l:'Yes',pct:72,n:149},{l:'No',pct:18,n:38},{l:'Not Sure',pct:10,n:21}] },
      ]
    },
    { id:2,  title:'Future of Work Webinar',      owner:'Rahul Verma',    ownerInit:'RV', status:'upcoming',   code:'CV-48290', questions:18, participants:172, created:'11 Jan 2024', desc:'', settings:{allowQ:true,upvotes:true,chat:true,clustering:false,record:true,reactions:true}, questions_data:[], polls:[] },
    { id:3,  title:'Product Strategy Session',    owner:'Ananya Iyer',    ownerInit:'AI', status:'conducted',  code:'CV-48289', questions:45, participants:0,   created:'10 Jan 2024', desc:'', settings:{allowQ:true,upvotes:false,chat:true,clustering:true,record:false,reactions:false}, questions_data:[], polls:[] },
    { id:4,  title:'Startup Pitch Session',       owner:'Vikram Patel',   ownerInit:'VP', status:'live',       code:'CV-48288', questions:9,  participants:78,  created:'10 Jan 2024', desc:'', settings:{allowQ:true,upvotes:true,chat:false,clustering:false,record:false,reactions:true}, questions_data:[], polls:[] },
    { id:5,  title:'Marketing Masters Live',      owner:'Siddharth Jain', ownerInit:'SJ', status:'upcoming',   code:'CV-48287', questions:5,  participants:64,  created:'09 Jan 2024', desc:'', settings:{allowQ:true,upvotes:true,chat:true,clustering:true,record:true,reactions:true}, questions_data:[], polls:[] },
    { id:6,  title:'Research Roundtable',         owner:'Neha Kulkarni',  ownerInit:'NK', status:'conducted',  code:'CV-48286', questions:7,  participants:0,   created:'08 Jan 2024', desc:'', settings:{allowQ:true,upvotes:true,chat:false,clustering:true,record:false,reactions:false}, questions_data:[], polls:[] },
    { id:7,  title:'Leadership Talk Series',      owner:'Meera Nair',     ownerInit:'MN', status:'past',       code:'CV-48285', questions:12, participants:0,   created:'07 Jan 2024', desc:'', settings:{allowQ:true,upvotes:false,chat:true,clustering:false,record:true,reactions:true}, questions_data:[], polls:[] },
    { id:8,  title:'Tech Innovators Meet',        owner:'Arjun Reddy',    ownerInit:'AR', status:'upcoming',   code:'CV-48284', questions:14, participants:63,  created:'07 Jan 2024', desc:'', settings:{allowQ:true,upvotes:true,chat:true,clustering:true,record:false,reactions:true}, questions_data:[], polls:[] },
    { id:9,  title:'Design Thinking Workshop',    owner:'Kavya Shetty',   ownerInit:'KS', status:'conducted',  code:'CV-48283', questions:21, participants:0,   created:'06 Jan 2024', desc:'', settings:{allowQ:false,upvotes:true,chat:true,clustering:false,record:true,reactions:false}, questions_data:[], polls:[] },
    { id:10, title:'Data Science Bootcamp',       owner:'Rohit Gupta',    ownerInit:'RG', status:'past',       code:'CV-48282', questions:16, participants:0,   created:'05 Jan 2024', desc:'', settings:{allowQ:true,upvotes:true,chat:true,clustering:true,record:true,reactions:true}, questions_data:[], polls:[] },
  ],

  users: [
    { id:1,  name:'Priya Sharma',   email:'priya.sharma@email.com',   init:'PS', role:'superadmin', auth:'google',   meetings:24, questions:312, joined:'12 Jan 2024', lastActive:'2m ago',  suspended:true,
      ownedMeetings:[{title:'AI in Education Summit',status:'live',q:32},{title:'Future of Work Webinar',status:'upcoming',q:18},{title:'Product Strategy Session',status:'past',q:45}],
      recentQ:[{text:'How can AI personalize learning experiences…',status:'pending',meeting:'AI in Education Summit',ago:'2m ago'},{text:'What are the key ethical concerns in AI?',status:'under_review',meeting:'Future of Work Webinar',ago:'18m ago'},{text:'Best practices for implementing AI in classrooms?',status:'answered',meeting:'AI in Education Summit',ago:'1h ago'}],
      recentVotes:['How can AI personalize learning expe…','What are the key ethical concerns in AI?'],
      notifications:[{type:'system',text:'Password changed successfully',ago:'2d ago'},{type:'security',text:'New login from Chrome on Windows',ago:'3d ago'},{type:'meeting',text:'You were added as admin to a meeting',ago:'5d ago'}]
    },
    { id:2,  name:'Rahul Verma',     email:'rahul.verma@email.com',    init:'RV', role:'admin',       auth:'password', meetings:18, questions:186, joined:'18 Feb 2024', lastActive:'5m ago',  suspended:false, ownedMeetings:[], recentQ:[], recentVotes:[], notifications:[] },
    { id:3,  name:'Ananya Iyer',     email:'ananya.iyer@email.com',    init:'AI', role:'user',        auth:'google',   meetings:7,  questions:98,  joined:'02 Mar 2024', lastActive:'15m ago', suspended:false, ownedMeetings:[], recentQ:[], recentVotes:[], notifications:[] },
    { id:4,  name:'Vikram Patel',    email:'vikram.patel@email.com',   init:'VP', role:'user',        auth:'password', meetings:5,  questions:67,  joined:'05 Mar 2024', lastActive:'28m ago', suspended:false, ownedMeetings:[], recentQ:[], recentVotes:[], notifications:[] },
    { id:5,  name:'Neha Kulkarni',   email:'neha.kulkarni@email.com',  init:'NK', role:'admin',       auth:'google',   meetings:11, questions:142, joined:'10 Mar 2024', lastActive:'1h ago',  suspended:false, ownedMeetings:[], recentQ:[], recentVotes:[], notifications:[] },
    { id:6,  name:'Siddharth Jain',  email:'siddharth.jain@email.com', init:'SJ', role:'user',        auth:'password', meetings:3,  questions:41,  joined:'21 Mar 2024', lastActive:'1h ago',  suspended:false, ownedMeetings:[], recentQ:[], recentVotes:[], notifications:[] },
    { id:7,  name:'Meera Nair',      email:'meera.nair@email.com',     init:'MN', role:'user',        auth:'google',   meetings:2,  questions:29,  joined:'25 Mar 2024', lastActive:'2h ago',  suspended:false, ownedMeetings:[], recentQ:[], recentVotes:[], notifications:[] },
    { id:8,  name:'Arjun Reddy',     email:'arjun.reddy@email.com',    init:'AR', role:'admin',       auth:'google',   meetings:16, questions:210, joined:'02 Apr 2024', lastActive:'3h ago',  suspended:false, ownedMeetings:[], recentQ:[], recentVotes:[], notifications:[] },
    { id:9,  name:'Kavya Shetty',    email:'kavya.shetty@email.com',   init:'KS', role:'user',        auth:'password', meetings:1,  questions:12,  joined:'08 Apr 2024', lastActive:'1h ago',  suspended:false, ownedMeetings:[], recentQ:[], recentVotes:[], notifications:[] },
    { id:10, name:'Rohit Gupta',     email:'rohit.gupta@email.com',    init:'RG', role:'user',        auth:'password', meetings:0,  questions:7,   joined:'12 Apr 2024', lastActive:'1d ago',  suspended:false, ownedMeetings:[], recentQ:[], recentVotes:[], notifications:[] },
  ],
};
