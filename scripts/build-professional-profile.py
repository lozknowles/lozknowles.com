#!/usr/bin/env python3
"""Build the public professional profile from the reviewed Markdown source."""
from pathlib import Path
from html import escape
from reportlab import rl_config
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.pdfbase.pdfdoc import PDFDictionary, PDFInfo, PDFString
from reportlab.platypus import SimpleDocTemplate, Paragraph, PageBreak

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'LawrenceKnowlesProfessionalProfile.pdf'
rl_config.invariant=True

class PublicPDFInfo(PDFInfo):
 def format(self, document):
  return PDFDictionary({'Title':PDFString('Lawrence Knowles Professional Profile'),
   'Author':PDFString('Lawrence Knowles'),
   'Subject':PDFString('Research and development leadership in AI HR and payroll')}).format(document)

class ProfileDoc(SimpleDocTemplate):
 def beforeDocument(self):
  super().beforeDocument()
  self.canv._doc.info=PublicPDFInfo()

def page(canvas,doc):
 canvas.saveState()
 canvas.setFont('Helvetica',8)
 canvas.setFillColor(HexColor('#526463'))
 canvas.drawString(43,23,'Lawrence Knowles | lozknowles.com')
 canvas.drawRightString(A4[0]-43,23,str(doc.page))
 canvas.restoreState()

def build():
 styles={
  'title':ParagraphStyle('Title',fontName='Helvetica-Bold',fontSize=23,leading=27,spaceAfter=8),
  'h1':ParagraphStyle('Heading',fontName='Helvetica-Bold',fontSize=12,leading=15,spaceBefore=9,spaceAfter=5,keepWithNext=True),
  'h2':ParagraphStyle('Role',fontName='Helvetica-Bold',fontSize=10,leading=13,spaceBefore=6,spaceAfter=4,keepWithNext=True),
  'body':ParagraphStyle('Body',fontName='Helvetica',fontSize=9.7,leading=12.6,spaceAfter=5),
  'bullet':ParagraphStyle('Bullet',fontName='Helvetica',fontSize=9.7,leading=12.6,spaceAfter=4,leftIndent=12,bulletIndent=1),
 }
 story=[]
 for block in (ROOT/'professional-profile-source.md').read_text(encoding='utf-8').strip().split('\n\n'):
  if block=='<!-- pagebreak -->': story.append(PageBreak()); continue
  style='body'; bullet=None
  for prefix,key in [('### ','h2'),('## ','h1'),('# ','title'),('- ','bullet')]:
   if block.startswith(prefix):
    block=block[len(prefix):]; style=key
    if key=='bullet': bullet='-'
    break
  story.append(Paragraph(escape(block).replace('\n','<br/>'),styles[style],bulletText=bullet))
 ProfileDoc(str(OUTPUT),pagesize=A4,leftMargin=43,rightMargin=43,topMargin=38,bottomMargin=38).build(story,onFirstPage=page,onLaterPages=page)
 print(OUTPUT)

if __name__=='__main__': build()
