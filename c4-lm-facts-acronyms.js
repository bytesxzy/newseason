/* More acronyms and abbreviations: texting, organisations, internet, medicine, work and money, Latin shorthand. Local only. */
(function (root) {
  "use strict";
  var F = root.C4LMFacts;
  if (!F) return;
  var out = [];
  ("LOL|laughing out loud;BRB|be right back;OMG|oh my god;FYI|for your information;IMO|in my opinion;IMHO|in my humble opinion;BTW|by the way;TBH|to be honest;" +
   "IDK|I don't know;FOMO|fear of missing out;YOLO|you only live once;ETA|estimated time of arrival;RSVP|please reply, from the French repondez s'il vous plait;" +
   "AKA|also known as;DM|direct message;SMH|shaking my head;ROFL|rolling on the floor laughing;TTYL|talk to you later;GG|good game;AFK|away from keyboard;" +
   "NFL|National Football League;NHL|National Hockey League;MLB|Major League Baseball;FDA|Food and Drug Administration;CDC|Centers for Disease Control and Prevention;" +
   "EPA|Environmental Protection Agency;IRS|Internal Revenue Service;NSA|National Security Agency;UNHCR|United Nations High Commissioner for Refugees;" +
   "ASEAN|Association of Southeast Asian Nations;OECD|Organisation for Economic Co-operation and Development;WWF|World Wide Fund for Nature;IOC|International Olympic Committee;" +
   "UEFA|Union of European Football Associations;BBC|British Broadcasting Corporation;CNN|Cable News Network;ESA|European Space Agency;CERN|the European Organization for Nuclear Research;" +
   "MIT|Massachusetts Institute of Technology;UCLA|University of California, Los Angeles;NYC|New York City;LA|Los Angeles;DC|District of Columbia;" +
   "URL|uniform resource locator;HTML|hypertext markup language;CSS|cascading style sheets;PDF|portable document format;JPEG|Joint Photographic Experts Group;GIF|graphics interchange format;" +
   "PNG|portable network graphics;USB|universal serial bus;LAN|local area network;WAN|wide area network;DNS|domain name system;IP|internet protocol;TCP|transmission control protocol;" +
   "VPN|virtual private network;SQL|structured query language;CPU|central processing unit;GPU|graphics processing unit;BIOS|basic input/output system;HDMI|high-definition multimedia interface;" +
   "DVD|digital versatile disc;CD|compact disc;SEO|search engine optimization;UI|user interface;UX|user experience;VoIP|voice over internet protocol;SaaS|software as a service;" +
   "CPR|cardiopulmonary resuscitation;ER|emergency room;ECG|electrocardiogram;EKG|electrocardiogram;EEG|electroencephalogram;ADHD|attention deficit hyperactivity disorder;" +
   "PTSD|post-traumatic stress disorder;OCD|obsessive-compulsive disorder;COVID|coronavirus disease;SARS|severe acute respiratory syndrome;AED|automated external defibrillator;" +
   "IV|intravenous, meaning into a vein;GP|general practitioner;STD|sexually transmitted disease;UV|ultraviolet;IR|infrared;" +
   "SCUBA|self-contained underwater breathing apparatus;LASER|light amplification by stimulated emission of radiation;RADAR|radio detection and ranging;SONAR|sound navigation and ranging;" +
   "AWOL|absent without leave;POW|prisoner of war;MIA|missing in action;KIA|killed in action;RIP|rest in peace;TBA|to be announced;TBC|to be confirmed;PS|postscript;" +
   "PTO|paid time off;COO|chief operating officer;CTO|chief technology officer;HR|human resources;PR|public relations;R&D|research and development;B2B|business to business;" +
   "ROI|return on investment;KPI|key performance indicator;GNP|gross national product;VAT|value added tax;APR|annual percentage rate;ISBN|International Standard Book Number;" +
   "ID|identification;DOB|date of birth;ZIP|Zone Improvement Plan;NB|nota bene, meaning note well;CE|Common Era;BCE|Before the Common Era;" +
   "EU|European Union;NASDAQ|National Association of Securities Dealers Automated Quotations;NYSE|New York Stock Exchange;SEC|Securities and Exchange Commission;" +
   "STEM|science, technology, engineering and mathematics;SAT|Scholastic Assessment Test;GPA|grade point average;MBA|Master of Business Administration;BA|Bachelor of Arts;BSc|Bachelor of Science;" +
   "MD|Doctor of Medicine;RN|registered nurse;DJ|disc jockey;MC|master of ceremonies;MVP|most valuable player;GOAT|greatest of all time;" +
   "LGBT|lesbian, gay, bisexual and transgender;NGO|non-governmental organization;PM|prime minister, or post meridiem in time;MP|member of parliament;" +
   "MPG|miles per gallon;RPM|revolutions per minute;MPH|miles per hour;KPH|kilometres per hour;ABS|anti-lock braking system;SUV|sport utility vehicle;" +
   "WWW|World Wide Web;WiFi|a trademark for wireless networking, and it is often wrongly said to stand for wireless fidelity;OK|a word whose origin is disputed, though it probably began as a joking misspelling of all correct in the 1830s;" +
   "DIY|do it yourself;FAQ|frequently asked questions;FYI|for your information;CC|carbon copy in email;BCC|blind carbon copy in email;RE|regarding, or reply, in an email subject line").split(";").forEach(function (row) {
    var i = row.indexOf("|"); if (i < 0) return;
    var k = row.slice(0, i), v = row.slice(i + 1);
    out.push(k + " stands for " + v + ".");
  });
  out.push("TL;DR stands for too long; didn't read.");
  out.push("The abbreviation e.g. stands for the Latin exempli gratia, meaning for example.");
  out.push("The abbreviation i.e. stands for the Latin id est, meaning that is.");
  out.push("The abbreviation etc. stands for the Latin et cetera, meaning and so on.");
  out.push("The abbreviation vs. stands for versus, meaning against.");
  out.push("The abbreviation a.m. stands for ante meridiem, meaning before noon, and p.m. stands for post meridiem, meaning after noon.");
  F.add(out);
})(typeof window !== "undefined" ? window : globalThis);
