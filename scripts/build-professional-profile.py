#!/usr/bin/env python3
"""Build the public, privacy-reduced professional profile PDF."""

from pathlib import Path

from reportlab import rl_config
from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfdoc import PDFDictionary, PDFInfo, PDFString
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    HRFlowable,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "LawrenceKnowlesProfessionalProfile.pdf"
PROFILE_TITLE = "Lawrence Knowles - Professional Profile"
PROFILE_AUTHOR = "Lawrence Knowles"
PROFILE_SUBJECT = "Privacy-reduced professional profile"

# Stable object ordering and identifiers make the checked-in PDF reproducible.
rl_config.invariant = True

INK = HexColor("#06100F")
TEAL = HexColor("#176B67")
TEAL_DARK = HexColor("#0D4542")
MINT = HexColor("#DDF2ED")
SLATE = HexColor("#526463")
LINE = HexColor("#CBD8D4")


class PublicPDFInfo(PDFInfo):
    """Keep intentional authorship while omitting tool and timestamp metadata."""

    def format(self, document):
        return PDFDictionary(
            {
                "Title": PDFString(self.title),
                "Author": PDFString(self.author),
                "Subject": PDFString(self.subject),
            }
        ).format(document)


class ProfileDoc(BaseDocTemplate):
    def __init__(self):
        super().__init__(
            str(OUTPUT),
            pagesize=A4,
            leftMargin=18 * mm,
            rightMargin=18 * mm,
            topMargin=17 * mm,
            bottomMargin=16 * mm,
            title=PROFILE_TITLE,
            author=PROFILE_AUTHOR,
            subject=PROFILE_SUBJECT,
        )
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="profile")
        self.addPageTemplates(PageTemplate(id="profile", frames=[frame], onPage=self._page))

    def beforeDocument(self):
        super().beforeDocument()
        info = PublicPDFInfo()
        info.title = PROFILE_TITLE
        info.author = PROFILE_AUTHOR
        info.subject = PROFILE_SUBJECT
        self.canv._doc.info = info

    def _page(self, canvas, doc):
        canvas.saveState()
        canvas.setFillColor(INK)
        canvas.rect(0, A4[1] - 46 * mm, A4[0], 46 * mm, fill=1, stroke=0)
        canvas.setStrokeColor(LINE)
        canvas.line(self.leftMargin, 12 * mm, A4[0] - self.rightMargin, 12 * mm)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(SLATE)
        canvas.drawString(self.leftMargin, 8 * mm, "Professional profile")
        canvas.drawRightString(A4[0] - self.rightMargin, 8 * mm, "lozknowles.com")
        canvas.restoreState()


TITLE = ParagraphStyle(
    "Title", fontName="Helvetica-Bold", fontSize=25, leading=29,
    textColor=colors.white, spaceAfter=4,
)
SUBTITLE = ParagraphStyle(
    "Subtitle", fontName="Helvetica", fontSize=11.5, leading=15,
    textColor=MINT, spaceAfter=12,
)
H2 = ParagraphStyle(
    "H2", fontName="Helvetica-Bold", fontSize=11.5, leading=14,
    textColor=TEAL_DARK, spaceBefore=5, spaceAfter=4, keepWithNext=True,
)
BODY = ParagraphStyle(
    "Body", fontName="Helvetica", fontSize=8.7, leading=12.3,
    textColor=INK, spaceAfter=6,
)
BULLET = ParagraphStyle(
    "Bullet", parent=BODY, leftIndent=10, firstLineIndent=-6,
    bulletIndent=1, spaceAfter=2.5,
)
SMALL = ParagraphStyle(
    "Small", fontName="Helvetica", fontSize=7.8, leading=10.5,
    textColor=SLATE,
)


def section(title, body):
    return [Paragraph(title, H2), HRFlowable(width="100%", thickness=0.7, color=LINE, spaceAfter=4), Paragraph(body, BODY)]


def bullet(text):
    return Paragraph(text, BULLET, bulletText="-")


def build():
    story = [
        Spacer(1, 1 * mm),
        Paragraph("Lawrence Knowles", TITLE),
        Paragraph("Product leader | Implementation adviser | Curious builder", SUBTITLE),
        Spacer(1, 14 * mm),
    ]

    intro = (
        "I help organisations make better product, delivery and implementation decisions. "
        "My work combines strategic clarity, practical programme assurance and calm stakeholder "
        "leadership, shaped by more than three decades across HR software, SaaS, payroll and "
        "enterprise transformation."
    )
    story += section("Profile", intro)
    story.append(Paragraph(
        "I am most useful where the situation is complex: aligning leaders around the real problem, "
        "testing whether plans are credible, exposing risk early and turning difficult technical or "
        "commercial questions into decisions people can act on.", BODY
    ))

    core = [
        "Product strategy and roadmap clarity",
        "Implementation and programme assurance",
        "Executive and stakeholder alignment",
        "Technology-led business transformation",
        "Governance, risk and decision support",
        "Customer-facing delivery",
    ]
    value = [
        "Independent review of complex products, programmes and implementations",
        "Clear recommendations grounded in customer, delivery and commercial reality",
        "Constructive challenge that improves confidence without slowing progress",
        "Translation between executive, product, technical and operational teams",
        "Hands-on curiosity with AI, software prototyping and digital projects",
    ]
    two_col = Table(
        [[
            [Paragraph("Core focus", H2), HRFlowable(width="100%", thickness=0.7, color=LINE, spaceAfter=4)] + [bullet(x) for x in core],
            [Paragraph("The value I bring", H2), HRFlowable(width="100%", thickness=0.7, color=LINE, spaceAfter=4)] + [bullet(x) for x in value],
        ]],
        colWidths=[84 * mm, 84 * mm],
    )
    two_col.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, 0), 0),
        ("RIGHTPADDING", (0, 0), (0, 0), 6 * mm),
        ("LEFTPADDING", (1, 0), (1, 0), 6 * mm),
        ("RIGHTPADDING", (1, 0), (1, 0), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2 * mm),
        ("LINEBEFORE", (1, 0), (1, 0), 0.5, LINE),
    ]))
    story += [Spacer(1, 2 * mm), two_col]

    story += section(
        "Working style",
        "Clear, pragmatic and collaborative. I ask direct questions, make complexity understandable "
        "and focus attention on the decisions that will have the greatest effect."
    )
    story += section(
        "Current interests",
        "Alongside advisory work, I explore applied AI, computer vision, local history and "
        "community-focused digital tools. These experiments keep my thinking practical and connected "
        "to how technology behaves outside a slide deck."
    )

    contact = Table(
        [[
            Paragraph("CONTINUE THE CONVERSATION", ParagraphStyle(
                "Kicker", fontName="Helvetica-Bold", fontSize=7.2, leading=9,
                textColor=TEAL, spaceAfter=3,
            )),
            Paragraph(
                '<link href="https://www.lozknowles.com/" color="#0D4542"><b>lozknowles.com</b></link><br/>'
                '<link href="https://github.com/lozknowles" color="#526463">github.com/lozknowles</link>',
                SMALL,
            ),
        ]],
        colWidths=[57 * mm, 111 * mm],
    )
    contact.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), MINT),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 4 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4 * mm),
    ]))
    story += [Spacer(1, 2 * mm), contact]

    ProfileDoc().build(story)
    print(OUTPUT)


if __name__ == "__main__":
    build()
