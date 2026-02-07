# Personality presets research (Perplexity)

Ten internationally known figures, diverse across **time, region, and domain**, with balanced representation beyond Europe. OCEAN values on 0–1 scale from Perplexity API queries (biographical/psychological literature). Used to populate `src/config/personality-presets.ts`.

| # | Name | Era/Region | Domain | O | C | E | A | N | Rationale |
|---|------|------------|--------|---|---|---|---|---|-----------|
| 1 | Albert Einstein | 20th, Germany/US | Science | 0.95 | 0.90 | 0.40 | 0.50 | 0.30 | Biographical analyses: curiosity, persistence, introspective; PMC/hub.edubirdie |
| 2 | Marie Curie | 19th–20th, Poland/France | Science | 0.90 | 0.95 | 0.30 | 0.60 | 0.50 | Perseverance, solitary focus, biographical synthesis (Nobel, PMC) |
| 3 | Nelson Mandela | 20th, South Africa | Leadership | 0.90 | 0.90 | 0.85 | 0.90 | 0.10 | Leadership analyses: forgiveness, charisma, consensus (Course Hero, PSU, Time) |
| 4 | Wangari Maathai | 20th, Kenya | Environment/Leadership | 0.90 | 0.90 | 0.70 | 0.40 | 0.30 | Green Belt Movement; visionary, relentless, confrontational; resilient (Unbowed, USF) |
| 5 | Frida Kahlo | 20th, Mexico | Arts | 0.90 | 0.58 | 0.50 | 0.75 | 0.80 | Art/writings: high openness/neuroticism (sarahransomeart, truity, 16personalities) |
| 6 | Confucius | Ancient China | Philosophy | 0.60 | 0.90 | 0.40 | 0.90 | 0.20 | Teachings (li, ren); cerebralquotient, Simply Psychology |
| 7 | Simón Bolívar | 19th, South America (Venezuela) | Leadership | 0.90 | 0.85 | 0.80 | 0.40 | 0.70 | Enlightenment visionary, iron will, charismatic; prideful, mood swings (Britannica, EBSCO) |
| 8 | Sitting Bull | 19th, Indigenous Americas (Lakota) | Leadership | 0.40 | 0.90 | 0.60 | 0.20 | 0.30 | Traditional, steadfast; defiant sovereignty, calm (NPS, Course Hero) |
| 9 | Sejong the Great | 15th, Korea | Leadership/Culture | 0.90 | 0.95 | 0.40 | 0.90 | 0.20 | Scholarly, Hangul; humble, benevolent (Asia Society, Weebly) |
| 10 | Rabindranath Tagore | 20th, India | Arts/Literature | 0.90 | 0.65 | 0.60 | 0.85 | 0.35 | Biographical: very high openness/agreeableness (tagoreanworld, wikipedia) |

**Diversity:** Europe (2: Einstein, Marie Curie); Africa (2: Mandela, Wangari Maathai); East Asia (2: Confucius, Sejong); South Asia (1: Tagore); Latin America (1: Frida Kahlo); South America (1: Simón Bolívar); Indigenous Americas (1: Sitting Bull).

All values are 0–1. Rationale/source abbreviated; full citations in Perplexity query outputs.
