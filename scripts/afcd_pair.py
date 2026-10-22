import json

def offline_bytes(catalog):
    features=[{'type':'Feature','properties':{'name':row['name'],'sourceId':row['id']},'geometry':{'type':'MultiLineString','coordinates':row['referencePaths']}} for row in catalog['routes']]
    pack={'sourceGeneratedAt':catalog['generatedAt'],'format':'hiking-earth-offline-v1','name':'香港郊野公园官方步道参考线','attribution':catalog['attribution'],'license':'DATA.GOV.HK 使用条款 1.2 · https://data.gov.hk/en/terms-and-conditions','geometry':{'type':'FeatureCollection','features':features}}
    return (json.dumps(pack,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n').encode('utf-8')
