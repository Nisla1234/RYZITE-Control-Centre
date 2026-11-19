export const mainSiteSeed = {
  pages: [
    {
      id: 'main-site-home',
      title: 'Home',
      slug: '/',
      summary: 'Ideas × Design × Technology × Growth. We bring design, technology and marketing together to turn ambitious ideas into clear, useful digital experiences.',
      metaTitle: 'RYZITE | Digital Marketing & Technology',
      metaDescription: 'One Agency. All Your Business Solutions.',
      blocks: [
        { id: 'home-h1', type: 'heading', level: 1, text: 'Have an idea? Make it happen.' },
        { id: 'home-intro', type: 'paragraph', text: 'We bring design, technology and marketing together to turn ambitious ideas into clear, useful digital experiences.' },
        { id: 'home-pathways', type: 'heading', level: 2, text: 'From getting noticed to building what comes next.' },
        { id: 'home-pathways-copy', type: 'paragraph', text: 'Whether you want to grow your business or build a new idea, we bring the right people, tools and strategy together.' },
        { id: 'home-cta', type: 'cta', ctaHeading: 'Something in mind?', ctaBody: 'Tell us about your project and we will help you explore practical next steps.', ctaButtonText: 'Contact RYZITE', ctaButtonUrl: '/contact/' }
      ]
    },
    {
      id: 'main-site-about',
      title: 'About RYZITE',
      slug: '/about/',
      summary: 'Meet RYZITE, a digital solutions company bringing marketing services and technology solutions together to help businesses grow.',
      metaTitle: 'About RYZITE | Digital Marketing & Technology Solutions',
      metaDescription: 'Meet RYZITE, a digital solutions company bringing marketing services and technology solutions together to help businesses grow.',
      blocks: [
        { id: 'about-h1', type: 'heading', level: 1, text: 'Turning Ideas Into Digital Possibilities.' },
        { id: 'about-intro', type: 'paragraph', text: 'At RYZITE, we believe every business deserves the right combination of technology, creativity, and digital strategy to grow.' },
        { id: 'about-statement', type: 'paragraph', text: 'One Site. Solve Every Problem.' },
        { id: 'about-cta', type: 'cta', ctaHeading: 'Start a Project', ctaBody: 'Explore our services or get in touch to discuss your business needs.', ctaButtonText: 'Start a Project', ctaButtonUrl: '/contact/' }
      ]
    },
    {
      id: 'main-site-services',
      title: 'Marketing Services',
      slug: '/services/',
      summary: 'Reach the right people, tell your story, and turn attention into business growth.',
      metaTitle: 'Marketing Services | RYZITE',
      metaDescription: 'Explore RYZITE marketing services including SEO, advertising, social media, branding, content, CRM, and practical AI marketing support.',
      blocks: [
        { id: 'services-h1', type: 'heading', level: 1, text: 'Marketing Services' },
        { id: 'services-intro', type: 'paragraph', text: 'Reach the right people, tell your story, and turn attention into business growth.' },
        { id: 'services-copy', type: 'paragraph', text: 'Explore the current marketing service catalogue in the Services module. Each item below is imported from the live main-site source.' }
      ]
    },
    {
      id: 'main-site-solutions',
      title: 'Technology Solutions',
      slug: '/solutions/',
      summary: 'Create the digital tools, platforms, and experiences that move your business forward.',
      metaTitle: 'Technology Solutions | RYZITE',
      metaDescription: 'Explore RYZITE technology solutions for websites, online stores, software, mobile apps, chatbots, automation, design, integrations, and website care.',
      blocks: [
        { id: 'solutions-h1', type: 'heading', level: 1, text: 'Technology Solutions' },
        { id: 'solutions-intro', type: 'paragraph', text: 'Create the digital tools, platforms, and experiences that move your business forward.' },
        { id: 'solutions-copy', type: 'paragraph', text: 'Explore the current technology solution catalogue in the Solutions module. Each item below is imported from the live main-site source.' }
      ]
    },
    {
      id: 'main-site-contact',
      title: 'Contact RYZITE',
      slug: '/contact/',
      summary: 'Contact RYZITE to discuss websites, digital marketing, mobile applications, software development, and business automation solutions.',
      metaTitle: 'Contact RYZITE | Start Your Digital Project',
      metaDescription: 'Contact RYZITE to discuss websites, digital marketing, mobile applications, software development, and business automation solutions.',
      blocks: [
        { id: 'contact-h1', type: 'heading', level: 1, text: 'Let’s Turn Your Ideas Into Reality.' },
        { id: 'contact-intro', type: 'paragraph', text: 'Have a project in mind, a business challenge to solve, or a question about our services? We’re here to help you explore the right digital solutions for your business.' },
        { id: 'contact-supporting', type: 'paragraph', text: 'Whether you need a professional website, digital marketing support, a mobile application, or custom software, let’s start a conversation.' },
        { id: 'contact-cta', type: 'cta', ctaHeading: 'Start a Conversation', ctaBody: 'Tell us what you need and about your project.', ctaButtonText: 'Contact RYZITE', ctaButtonUrl: '/contact/#project-enquiry' }
      ]
    }
  ],
  services: [
    ['Google SEO & Search Visibility', 'Help your business get found in search.', 'Search presence review; Search topic planning; On-page content guidance; Review and refinement'],
    ['Google Ads Management', 'Reach customers when they’re ready to act.', 'Campaign goal planning; Keyword and audience research; Ad and landing-page alignment; Campaign review'],
    ['Facebook & Instagram Ads', 'Connect with your audience where they scroll.', 'Campaign objective planning; Audience considerations; Creative direction; Campaign review'],
    ['Social Media Management', 'Build a consistent, active brand presence.', 'Channel and profile review; Content themes; Publishing plan; Community guidance'],
    ['Branding & Logo Design', 'Give your business a memorable identity.', 'Brand direction; Visual identity concepts; Logo and supporting assets; Usage guidance'],
    ['Content, Reels & Motion Design', 'Bring your story to life through creative content.', 'Content concepts; Short-form video planning; Motion design direction; Content review'],
    ['Online Store Marketing', 'Turn product discovery into more sales.', 'Store and product review; Campaign and content planning; Customer journey review; Measurement discussion'],
    ['Marketing Automation & CRM', 'Keep your leads and customer journeys connected.', 'Customer journey mapping; CRM requirements review; Automation opportunities; Workflow review'],
    ['Blog Writing & Content Marketing', 'Share useful ideas that build trust over time.', 'Topic and audience planning; Editorial planning; Article development; Content alignment'],
    ['Website Tracking & Conversion Improvement', 'Understand visitors and improve their next step.', 'Measurement requirements; Tracking plan; Customer journey review; Improvement recommendations'],
    ['Practical AI Marketing Support', 'Make everyday marketing work smarter.', 'Workflow discovery; Use-case planning; Human review considerations; Workflow evaluation']
  ],
  solutions: [
    ['Business Website Design & Development', 'A professional home for your business online.', 'Page structure and content hierarchy; Responsive interface design; Contact paths and requested website features'],
    ['Online Store Development', 'Build a smooth shopping experience for your customers.', 'Product and category structure; Shopping cart and checkout requirements; Store operations and integration planning'],
    ['Custom Software for Businesses', 'Tools built around the way your business works.', 'Workflow and requirements planning; Interfaces for intended user roles; Integration and information needs'],
    ['Mobile App Development', 'Put your business in your customers’ hands.', 'Mobile user journeys and screen planning; Interface design for intended tasks; Required data and system connections'],
    ['Customer Chatbots & Assistants', 'Help customers find answers and take action.', 'Conversation flow and response planning; Knowledge content and common question mapping; Human handoff and next-step planning'],
    ['Business Workflow Automation', 'Connect everyday tasks and free up your team.', 'Workflow and task mapping; Automation triggers and action planning; Connections to relevant business tools'],
    ['UI/UX Design for Websites & Apps', 'Make every interaction clear and intuitive.', 'Information structure and user journeys; Interface layouts and interaction patterns; Usability and accessibility review'],
    ['Software & API Integrations', 'Get your systems working together.', 'System and integration requirements review; API and data-flow planning; Error and handoff considerations'],
    ['Website Care & Maintenance', 'Keep your website updated and running smoothly.', 'Website updates and content changes; Technical review and issue assessment; Maintenance priorities based on your site needs']
  ]
} as const;
