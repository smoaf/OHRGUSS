# Concept and research

This page collects the idea behind Ohrguss, the research it is based on and the open questions. It is a working document, not a finished study.

## The idea

Custom-moulded earplugs fit better and are more comfortable than foam plugs, but they usually need an ear impression taken by an audiologist and a lab to make them. Ohrguss tries to make that path cheaper and more accessible:

1. Capture the outer ear with a phone (photo with a coin for scale, or a 3D scan).
2. Pick the canal shape from a library of premade variants based on published ear-canal measurements, and confirm the size with a printed sizing kit.
3. Generate the plug, a silicone mould, a fitted case and the sizing kit as print files.
4. Print and cast at home or at a local print shop.

The project supplies the tool and the open designs. It does not manufacture or sell earplugs.

## Why the canal comes from a library

The ear canal is where an earplug seals, and it is also the part a phone cannot capture well:

- **Phone scanning resolution.** A 2026 comparison of phone-based methods found the rear LiDAR sensor too coarse for ear geometry, while photogrammetry and the front depth camera captured enough detail of the outer ear ([Forum Acusticum 2026](https://dael.euracoustics.org/confs/fa2026/data/articles/000152.pdf)).
- **The canal itself.** Even dedicated ear-scanner developers describe the canal as an unusually hard target for 3D scanning ([3DBODY.TECH 2015](https://proc.3dbody.tech/abstracts/2015/175hatzilias.html)). The canal also changes shape with jaw movement ([Unal et al.](https://research.sabanciuniv.edu/id/eprint/10697/1/52410518.pdf)).
- **Public datasets.** Large open ear datasets such as SONICOM close the canal at its entrance, because they are made for spatial audio ([extended SONICOM dataset](https://arxiv.org/html/2507.05053v2)). They help with the outer ear, not with the canal.

So the app takes the concha (the bowl of the outer ear) from a scan or photo, and the canal from parametric variants that the user checks with the sizing kit.

### Ways to capture the canal that were considered

- **Mouldable drugstore earplug**, scanned on the table afterwards. Cheap, captures the first part of the canal.
- **Sizing kit** of printed gauges. No canal scan at all; this is what the app does now.
- **Hybrid plug**: custom concha shell with a standard foam or silicone canal tip.
- **Two-part silicone impression** with an ear dam. Most accurate, but deep impressions carry a safety risk and belong with trained staff.

## Canal and concha data behind the presets

The canal presets and defaults are based on these published values (summarised from a [compilation of ear-canal studies](https://voxbooster.com/blog/custom-3d-printed-headphone-ear-canal-fit-statistics-2026/) unless noted):

| Measure | Value | Used for |
|---|---|---|
| Canal entrance, largest × smallest diameter | about 9.6 × 6.75 mm (men), 9.15 × 6.3 mm (women), Yu et al. 2015 | Size M is 9.4 × 6.5 mm; five sizes span about ±20 % |
| Spread between people | canal area differs by a factor of 2 to 3 | Sizing kit with fine steps |
| Canal area 6, 9 and 12 mm inside | median about 47, 40 and 35 mm², Keefe et al. 2025 | Tip size 85 % (the canal narrows inward) |
| Tightest bend | median radius about 34 mm, about 8 mm inside the entrance | Bend placed 8 mm in; presets 8°, 20°, 35° |
| Cavum concha depth | average about 10.2 mm (men) and 9.2 mm (women) ([headphone patent US 5,519,782](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/5519782)) | Default thickness 9 mm |
| Concha length | about 18.5 mm ([Hearing Health Matters](https://hearinghealthmatters.org/?p=7661)) | Default height 18.5 mm |

Caveats:

- The canal figures come from a secondary compilation, not from the original papers.
- Studies define the canal entrance differently, so other sources report larger entrance sizes.
- The default concha width (16 mm) is an estimate, not a measured value.

## Filters

Filter families used in custom musician and hearing-protection plugs:

- **Etymotic ER-9, ER-15, ER-25.** Interchangeable buttons with the same dimensions ([Etymotic fitting guide](https://audiologyonline.com/files/content/05700/05791/fittingguide0702-m.pdf)). Several brands, including Elacin, use them. They are tuned to a specific bore, so they will not perform as rated in an arbitrary plug.
- **Dynamic Ear Company (DEC) DM series**, in 10, 15 and 25 dB versions ([Future Sonics](https://www.futuresonics.com/ear-plugs)).
- **Hörluchs HLM** diaphragm filters ([Thomann](https://www.thomannmusic.com/hoerluchs_hlm_30.htm)).
- **Fischer Amps** acoustic filters, reported to fit Elacin plugs ([Thomann reviews](https://www.thomann.fi/fischer_amps_akustische_daempfungsfilt_18db.htm)).

No published seat dimensions were found for any of them. That is why the app lets you upload a 3D scan of your own filter and shapes the seat from it.

## Open-source building blocks

- **Photogrammetry:** COLMAP, OpenMVS, Meshroom. A [Stanford student project](https://web.stanford.edu/class/cs231a/prev_projects_2022/Stanford_AI__CV_Final_Project_Final_Report.pdf) got rough ear reconstructions from about 100 photos, not accurate enough for a fit.
- **Ear meshes and tools:** the SONICOM dataset (MIT license), [Mesh2HRTF](https://github.com/Any2HRTF/Mesh2HRTF) and [Pinna2HRTF](https://github.com/Any2HRTF/Pinna2HRTF), which include tools to clean ear meshes.
- **Earmold workflow:** an open same-day earmold method that cleans scanned impressions in Blender before printing ([AudiologyOnline](https://www.audiologyonline.com/articles/same-day-custom-ear-molds-27853)).
- **Fitting a design to a scan:** the ACAP method in a [Swinburne thesis](https://researchbank.swinburne.edu.au/file/5f28baf2-ffdb-4e35-bb9f-ae3390f00ff4/1/philip_kinsella_thesis.pdf) deforms a CAD design to a scan while keeping it printable. This is close to what the app's scan fitting does in a simpler form.

## Similar products

- **Fen X Custom** offers phone-based ear scanning for custom earplugs.
- **earfab** uses digital ear scans with resin-printed tooling ([Nexa3D case study](https://nexa3d.com/?p=15655)).
- **SnugFit EarCam** and **Hearables 3D** work on ear capture for custom fits.

## Legal notes

This is a summary of research, not legal advice.

- **Hearing protectors are category III PPE** under the EU PPE Regulation, the strictest class ([DGUV](https://www.dguv.de/ifa/fachinfos/laerm/gehoerschuetzer/index-2.jsp)). Selling them as protection needs a notified body.
- **Who counts as manufacturer.** The regulation defines the manufacturer as whoever makes PPE, or has it designed or made, and markets it under their name ([Regulation 2016/425, Article 3](https://www.legislation.gov.uk/eur/2016/425/article/3)). Publishing a method, or printing plugs for your own ears, does not market a product.
- **Product liability.** The new EU Product Liability Directive treats software and digital manufacturing files as products, but excludes free and open-source software ([CMS](https://cms.law/en/int/publication/the-new-eu-product-liability-directive-eu-2024-2853)). It applies to products placed on the market from 9 December 2026.
- **Consequence for this project:** keep it free and open source, make no attenuation or certification claims, and point users to certified protection wherever protection is required, for example at work.
- **Patents to check before any commercial use:** [US 11,881,040](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11881040) (ear insert shape from a phone photo matched to a database of 3D ear shapes). US 11,163,975 and US 10,122,989 were also noted during research and still need checking.

## Not done yet

- Nothing has been printed or cast; tolerances need tuning on real printers.
- Real ear scans, ear photos and filter scans have not been tested; only synthetic shapes.
- True photogrammetry and a phone link via QR code need a local version that runs on a computer; the web page cannot do the reconstruction.
- A listening fit check (plug in versus plug out) is planned.
- Trademark check for the name Ohrguss.
