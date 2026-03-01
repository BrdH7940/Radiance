export const MOCK_LATEX_CODE = `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{geometry}
\\usepackage{hyperref}
\\usepackage{enumitem}
\\usepackage{titlesec}
\\usepackage{xcolor}

\\geometry{left=1.5cm, right=1.5cm, top=1.5cm, bottom=1.5cm}

\\definecolor{accentblue}{RGB}{29, 78, 216}
\\definecolor{textgray}{RGB}{71, 85, 105}

\\hypersetup{colorlinks=true, linkcolor=accentblue, urlcolor=accentblue}

\\pagestyle{empty}
\\setlength{\\parindent}{0pt}

\\titleformat{\\section}{\\large\\bfseries\\color{accentblue}}{}{0em}{}[\\titlerule]
\\titlespacing*{\\section}{0pt}{8pt}{4pt}

\\begin{document}

% ─── Header ───────────────────────────────────────────────────────────────────
\\begin{center}
  {\\Huge\\bfseries Alex Johnson}\\\\[4pt]
  {\\small\\color{textgray}
    San Francisco, CA \\;·\\;
    \\href{mailto:alex@example.com}{alex@example.com} \\;·\\;
    \\href{https://linkedin.com/in/alexjohnson}{linkedin/alexjohnson} \\;·\\;
    \\href{https://github.com/alexjohnson}{github/alexjohnson}
  }
\\end{center}

\\vspace{6pt}

% ─── Summary ──────────────────────────────────────────────────────────────────
\\section{Professional Summary}

Senior Software Engineer with 6+ years of experience building scalable distributed systems
and high-throughput data pipelines. Proven track record of reducing infrastructure costs by
\\textbf{40\\%} while improving system reliability to 99.99\\% uptime. Passionate about
developer experience and open-source contributions.

% ─── Experience ───────────────────────────────────────────────────────────────
\\section{Experience}

\\textbf{Senior Software Engineer} \\hfill \\textit{Jan 2022 -- Present}\\\\
\\textit{\\color{textgray}DataStream Inc. · San Francisco, CA}
\\begin{itemize}[leftmargin=1.2em, itemsep=1pt]
  \\item Led migration of monolithic Python service to microservices architecture, reducing
        deployment time from 45 minutes to under 8 minutes.
  \\item Architected real-time event processing pipeline handling \\textbf{2M+ events/day}
        using Apache Kafka and Apache Flink, enabling sub-100ms analytics latency.
  \\item Mentored a team of 4 junior engineers and established code review standards that
        reduced production incidents by 60\\%.
\\end{itemize}

\\vspace{6pt}

\\textbf{Software Engineer} \\hfill \\textit{Jun 2019 -- Dec 2021}\\\\
\\textit{\\color{textgray}CloudBase Corp. · Remote}
\\begin{itemize}[leftmargin=1.2em, itemsep=1pt]
  \\item Built REST and GraphQL APIs serving 500K+ daily active users with p99 latency < 120ms.
  \\item Implemented automated CI/CD pipeline using GitHub Actions and Terraform, cutting
        release cycles from bi-weekly to on-demand.
\\end{itemize}

% ─── Skills ───────────────────────────────────────────────────────────────────
\\section{Technical Skills}

\\begin{tabular}{@{}ll}
  \\textbf{Languages:}    & Python, TypeScript, Go, Rust \\\\
  \\textbf{Frameworks:}   & FastAPI, Next.js, React, gRPC \\\\
  \\textbf{Data:}         & PostgreSQL, Redis, Kafka, Elasticsearch \\\\
  \\textbf{Cloud \\& DevOps:} & AWS (ECS, Lambda, RDS), Terraform, Docker, Kubernetes \\\\
\\end{tabular}

% ─── Education ────────────────────────────────────────────────────────────────
\\section{Education}

\\textbf{B.S. Computer Science} \\hfill \\textit{2015 -- 2019}\\\\
\\textit{\\color{textgray}University of California, Berkeley}

\\end{document}
`;

/** Steps shown during async upload + analysis (index 0–4). */
export const LOADING_STEPS = [
  { id: 1, label: 'Preparing upload…', duration: 0 },
  { id: 2, label: 'Uploading CV to storage…', duration: 0 },
  { id: 3, label: 'Starting analysis…', duration: 0 },
  { id: 4, label: 'Analyzing CV & job description…', duration: 0 },
  { id: 5, label: 'Generating enhanced CV…', duration: 0 },
];
