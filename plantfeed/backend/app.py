"""PlantFeed API: plant identification proxy + conservative care recommendations."""
import os
from datetime import date
from flask import Flask, jsonify, request
import requests

app=Flask(__name__)
MAX_IMAGE=12*1024*1024
PLANTNET="https://my-api.plantnet.org/v2/identify/all"

SUPPLIES={
 "banana":{"rating":"mild supplement","advice":"Compost is preferred. Banana-peel water may be used sparingly as a very mild supplement, not a complete feed.","evidence":"RHS"},
 "coffee":{"rating":"compost","advice":"Prefer composting spent grounds. Avoid thick direct layers in pots; residual caffeine and reduced air/water movement are concerns.","evidence":"RHS"},
 "eggshell":{"rating":"compost","advice":"Best composted. Calcium releases slowly; eggshell water is not a reliable complete fertiliser.","evidence":"conservative"},
 "rice":{"rating":"optional","advice":"Plain, unsalted, cooled rice water may occasionally replace a watering, but is not a balanced fertiliser.","evidence":"limited"},
 "rain":{"rating":"good water","advice":"Rainwater is a useful watering choice, particularly for plants sensitive to hard tap water.","evidence":"RHS"},
 "balanced":{"rating":"recommended feed","advice":"For foliage houseplants, use a labelled general-purpose or houseplant feed during active growth; do not exceed the label dose.","evidence":"RHS"}
}
@app.get("/health")
def health(): return jsonify(status="ok",service="plantfeed",version="0.1.0")

@app.post("/identify")
def identify():
    key=os.getenv("PLANTNET_API_KEY")
    if not key: return jsonify(error="identification_not_configured",message="PLANTNET_API_KEY is not configured"),503
    img=request.files.get("image")
    if not img: return jsonify(error="image_required"),400
    if img.mimetype not in ("image/jpeg","image/png"): return jsonify(error="jpeg_or_png_required"),415
    data=img.read(MAX_IMAGE+1)
    if len(data)>MAX_IMAGE: return jsonify(error="image_too_large",max_mb=12),413
    try:
        r=requests.post(PLANTNET,params={"api-key":key,"lang":"en","nb-results":3},
          files={"images":(img.filename or "plant.jpg",data,img.mimetype)},data={"organs":"auto"},timeout=25)
        r.raise_for_status(); raw=r.json()
    except requests.RequestException as e:
        return jsonify(error="identification_unavailable",message=str(e)),502
    out=[]
    for x in raw.get("results",[])[:3]:
        sp=x.get("species",{}); common=(sp.get("commonNames") or [])
        out.append({"scientific_name":sp.get("scientificNameWithoutAuthor") or sp.get("scientificName"),
          "common_name":common[0] if common else None,"confidence":round(float(x.get("score",0)),4)})
    return jsonify(best_match=raw.get("bestMatch"),candidates=out,engine_version=raw.get("version"))

@app.post("/recommend")
def recommend():
    d=request.get_json(silent=True) or {}; plant=(d.get("plant") or "").strip()
    state=d.get("condition","healthy"); supplies=d.get("supplies",[])
    if not plant: return jsonify(error="plant_required"),400
    m=int(d.get("month") or date.today().month); active=3<=m<=10
    hold=state in ("recently_repotted","wilting") or not active
    reasons=[]
    if state!="healthy": reasons.append("Visible stress can come from watering, light, drainage, pests or roots; diagnose before assuming nutrient deficiency.")
    if not active: reasons.append("UK low-light season: routine feeding should be reduced.")
    advice=[{"supply":s,**SUPPLIES[s]} for s in supplies if s in SUPPLIES]
    return jsonify(plant=plant,feed_now=not hold,status="hold_feed" if hold else "normal_care",
      reasons=reasons,advice=advice,safeguards=["Never fertilise dry compost.","Follow commercial feed label dilution.","Household leftovers are not complete fertilisers."])

if __name__=="__main__": app.run(host="0.0.0.0",port=int(os.getenv("PORT","8080")))
